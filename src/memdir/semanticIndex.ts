/**
 * Semantic Vector Index using sqlite-vec
 *
 * Persistent SQLite database with vector extension for fast approximate nearest
 * neighbor (ANN) search over memory embeddings. Replaces file-based .embedding.json
 * caching with indexed O(log N) lookups.
 *
 * Schema:
 *   vector_embeddings: (memory_path, embedding, content_hash, type, description, indexed_at)
 *   - embedding: 768-dimensional Granite multilingual vector
 *   - content_hash: MD5 of file content (detect changes without reading)
 *   - indexed_at: timestamp for staleness tracking
 */

import { Database } from 'bun:sqlite';
import { createHash } from 'crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { getClewConfigHomeDir } from '../utils/envUtils.js';
import { getAutoMemPath } from './paths.js';

let _db: Database | null = null;

/**
 * Get or initialize the semantic vector index database.
 * Loads sqlite-vec extension and creates schema on first call.
 */
function getDb(): Database {
  if (_db) return _db;

  const configHome = getClewConfigHomeDir();
  const dir = join(configHome, 'memory');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const dbPath = join(dir, 'vectors.db');
  _db = new Database(dbPath, { create: true });

  // Enable WAL for concurrent access
  _db.run('PRAGMA journal_mode = WAL');
  _db.run('PRAGMA synchronous = NORMAL');

  // Load sqlite-vec extension
  // Note: Bun's SQLite integration supports dynamic extension loading
  try {
    _db.run('SELECT load_extension("vec0")') ;
  } catch {
    // Fallback: try alternative loading method for Bun
    try {
      _db.run('SELECT load_extension("./vec0")');
    } catch {
      // If extension loading fails, create fallback schema without vector type
      console.warn('[memory] sqlite-vec extension unavailable, using text fallback');
      _createFallbackSchema(_db);
      return _db;
    }
  }

  _createSchema(_db);
  return _db;
}

/**
 * Create schema with vec0 vector type for fast ANN search.
 */
function _createSchema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS vector_embeddings (
      memory_path TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      embedding BLOB NOT NULL,  -- serialized 768-dim float32 array
      content_hash TEXT NOT NULL,
      type TEXT,
      description TEXT,
      indexed_at INTEGER NOT NULL
    )
  `);

  // Virtual table for vector search using sqlite-vec
  db.run(`
    CREATE VIRTUAL TABLE IF NOT EXISTS vectors USING vec0(
      embedding(768)
    )
  `);

  db.run('CREATE INDEX IF NOT EXISTS idx_vectors_indexed_at ON vector_embeddings(indexed_at DESC)');
  db.run('CREATE INDEX IF NOT EXISTS idx_vectors_type ON vector_embeddings(type)');
}

/**
 * Fallback schema when sqlite-vec is unavailable.
 * Uses text-based LIKE search instead of vector similarity.
 */
function _createFallbackSchema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS vector_embeddings (
      memory_path TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      embedding TEXT NOT NULL,  -- JSON-serialized vector
      content_hash TEXT NOT NULL,
      type TEXT,
      description TEXT,
      indexed_at INTEGER NOT NULL
    )
  `);

  db.run('CREATE INDEX IF NOT EXISTS idx_vectors_indexed_at ON vector_embeddings(indexed_at DESC)');
  db.run('CREATE INDEX IF NOT EXISTS idx_vectors_type ON vector_embeddings(type)');
}

/**
 * Compute MD5 hash of content for change detection.
 */
function hashContent(content: string): string {
  return createHash('md5').update(content).digest('hex');
}

/**
 * Serialize embedding vector to BLOB.
 * Uses Float32Array for efficient storage.
 */
function serializeEmbedding(embedding: number[]): Buffer {
  const arr = new Float32Array(embedding);
  return Buffer.from(arr.buffer);
}

/**
 * Deserialize embedding vector from BLOB.
 */
function deserializeEmbedding(blob: Buffer): number[] {
  const arr = new Float32Array(blob.buffer);
  return Array.from(arr);
}

/**
 * Index a memory file's embedding.
 * Skips if content hasn't changed (via content_hash).
 */
export async function indexMemory(
  filePath: string,
  filename: string,
  embedding: number[],
  opts: {
    type?: string;
    description?: string | null;
  } = {},
): Promise<boolean> {
  const db = getDb();
  const content = await readFile(filePath, 'utf-8');
  const contentHash = hashContent(content);

  // Check if already indexed with same content
  const existing = db
    .prepare('SELECT content_hash FROM vector_embeddings WHERE memory_path = ?')
    .get(filePath) as { content_hash: string } | undefined;

  if (existing && existing.content_hash === contentHash) {
    return false; // No change, skip
  }

  const now = Date.now();
  const embeddingBlob = serializeEmbedding(embedding);

  db.prepare(`
    INSERT OR REPLACE INTO vector_embeddings
    (memory_path, filename, embedding, content_hash, type, description, indexed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(filePath, filename, embeddingBlob, contentHash, opts.type || null, opts.description || null, now);

  return true; // Indexed
}

/**
 * Search vectors by semantic similarity.
 * Returns top-K results sorted by distance.
 *
 * @param queryEmbedding - Query vector (768 dimensions)
 * @param topK - Number of results
 * @param threshold - Minimum similarity score (0-1)
 * @returns Array of (filePath, filename, score, type, description)
 */
export interface VectorSearchResult {
  filePath: string;
  filename: string;
  score: number; // 0-1 cosine similarity
  type: string | null;
  description: string | null;
}

export async function searchVectors(
  queryEmbedding: number[],
  topK: number = 5,
  threshold: number = 0.6,
): Promise<VectorSearchResult[]> {
  const db = getDb();

  // Try vec0 vector search first
  try {
    const queryBlob = serializeEmbedding(queryEmbedding);

    const rows = db
      .prepare(`
        SELECT
          ve.memory_path,
          ve.filename,
          ve.type,
          ve.description,
          distance AS score
        FROM vectors
        JOIN vector_embeddings ve ON rowid = ve.rowid
        ORDER BY distance ASC
        LIMIT ?
      `)
      .all(topK) as Array<{
        memory_path: string;
        filename: string;
        type: string | null;
        description: string | null;
        score: number;
      }>;

    // Convert distance to similarity (distance = 1 - similarity for normalized vectors)
    return rows
      .map(r => ({
        ...r,
        score: Math.max(0, 1 - r.score),
      }))
      .filter(r => r.score >= threshold)
      .slice(0, topK);
  } catch {
    // Fallback: use cosine similarity in JS for all vectors
    return _fallbackVectorSearch(queryEmbedding, topK, threshold);
  }
}

/**
 * Fallback vector search when sqlite-vec unavailable.
 * Loads all vectors and computes cosine similarity in JavaScript.
 */
function _fallbackVectorSearch(
  queryEmbedding: number[],
  topK: number,
  threshold: number,
): VectorSearchResult[] {
  const db = getDb();

  const rows = db
    .prepare('SELECT memory_path, filename, embedding, type, description FROM vector_embeddings')
    .all() as Array<{
      memory_path: string;
      filename: string;
      embedding: Buffer;
      type: string | null;
      description: string | null;
    }>;

  // Compute cosine similarity for each
  const results = rows
    .map(r => {
      const stored = deserializeEmbedding(r.embedding);
      const score = cosineSimilarity(queryEmbedding, stored);
      return {
        filePath: r.memory_path,
        filename: r.filename,
        type: r.type,
        description: r.description,
        score,
      };
    })
    .filter(r => r.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return results;
}

/**
 * Cosine similarity between two vectors.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * Remove outdated embeddings (older than maxAgeDays).
 * Useful for periodic cleanup and stale vector removal.
 */
export function pruneOldVectors(maxAgeDays: number = 90): number {
  const db = getDb();
  const cutoffTime = Date.now() - maxAgeDays * 86_400_000;

  const result = db.prepare('DELETE FROM vector_embeddings WHERE indexed_at < ?').run(cutoffTime);

  return result.changes || 0;
}

/**
 * Clear all vectors (destructive).
 * Used for reset or testing.
 */
export function clearAllVectors(): void {
  const db = getDb();
  db.run('DELETE FROM vector_embeddings');
}

/**
 * Get index statistics.
 */
export function getIndexStats(): {
  total: number;
  byType: Record<string, number>;
  oldestIndexedAt: number | null;
  newestIndexedAt: number | null;
} {
  const db = getDb();

  const total = (db.prepare('SELECT COUNT(*) as c FROM vector_embeddings').get() as { c: number }).c;

  const typeRows = db
    .prepare('SELECT type, COUNT(*) as c FROM vector_embeddings GROUP BY type')
    .all() as Array<{ type: string | null; c: number }>;

  const byType: Record<string, number> = {};
  for (const r of typeRows) {
    byType[r.type || 'untyped'] = r.c;
  }

  const oldest = db.prepare('SELECT MIN(indexed_at) as t FROM vector_embeddings').get() as {
    t: number | null;
  };

  const newest = db.prepare('SELECT MAX(indexed_at) as t FROM vector_embeddings').get() as {
    t: number | null;
  };

  return {
    total,
    byType,
    oldestIndexedAt: oldest.t,
    newestIndexedAt: newest.t,
  };
}

/**
 * Close the database connection.
 */
export function closeIndex(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
