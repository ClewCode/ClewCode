/**
 * Semantic Vector Index using sqlite-vec
 *
 * Persistent SQLite database with vector extension for fast approximate nearest
 * neighbor (ANN) search over memory embeddings. Replaces file-based .embedding.json
 * caching with indexed lookups.
 *
 * Schema:
 *   vector_embeddings: metadata + serialized embedding (source of truth)
 *   vec_index:         vec0 virtual table, rowid-linked to vector_embeddings,
 *                      used for KNN when the extension loads. If the extension
 *                      is unavailable, searches brute-force over vector_embeddings.
 *
 * Distances: vec0 returns L2. All embeddings are L2-normalized, so
 * cosine similarity = 1 - (L2^2 / 2).
 */

import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'crypto';
import { join } from 'path';
import { logForDebugging } from '../utils/debug.js';
import { getClewConfigHomeDir } from '../utils/envUtils.js';

const EMBEDDING_DIM = 768;

let _db: Database | null = null;
let _vecLoaded = false;

/**
 * Get or initialize the semantic vector index database.
 * Loads sqlite-vec extension and creates schema on first call.
 */
function getDb(): Database {
  if (_db) return _db;

  const dir = join(getClewConfigHomeDir(), 'memory');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  _db = new Database(join(dir, 'vectors.db'), { create: true });
  _db.run('PRAGMA journal_mode = WAL');
  _db.run('PRAGMA synchronous = NORMAL');

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sqliteVec = require('sqlite-vec') as { load(db: Database): void };
    sqliteVec.load(_db);
    _vecLoaded = true;
  } catch (e) {
    _vecLoaded = false;
    logForDebugging(`[memdir] sqlite-vec unavailable, using brute-force search: ${e}`, { level: 'debug' });
  }

  _db.run(`
    CREATE TABLE IF NOT EXISTS vector_embeddings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      memory_path TEXT NOT NULL UNIQUE,
      filename TEXT NOT NULL,
      embedding BLOB NOT NULL,
      content_hash TEXT NOT NULL,
      type TEXT,
      description TEXT,
      indexed_at INTEGER NOT NULL
    )
  `);
  _db.run('CREATE INDEX IF NOT EXISTS idx_vectors_indexed_at ON vector_embeddings(indexed_at DESC)');
  _db.run('CREATE INDEX IF NOT EXISTS idx_vectors_type ON vector_embeddings(type)');

  if (_vecLoaded) {
    _db.run(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vec_index USING vec0(
        embedding float[${EMBEDDING_DIM}]
      )
    `);
  }

  return _db;
}

/** Compute MD5 hash of content for change detection. */
export function hashContent(content: string): string {
  return createHash('md5').update(content).digest('hex');
}

function serializeEmbedding(embedding: number[]): Buffer {
  return Buffer.from(new Float32Array(embedding).buffer);
}

function deserializeEmbedding(blob: Buffer): number[] {
  return Array.from(new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4));
}

/**
 * Check whether a memory file needs (re-)indexing without reading it.
 * Compares the file's mtime against when it was last indexed.
 */
export function needsIndexing(memoryPath: string, mtimeMs: number): boolean {
  const db = getDb();
  const row = db.prepare('SELECT indexed_at FROM vector_embeddings WHERE memory_path = ?').get(memoryPath) as
    | { indexed_at: number }
    | undefined;
  return !row || row.indexed_at < mtimeMs;
}

/**
 * Index a memory file's embedding. Skips when content is unchanged
 * (content_hash). Keeps vec_index in sync with vector_embeddings.
 *
 * @returns true if the index was updated
 */
export function indexMemory(
  memoryPath: string,
  filename: string,
  content: string,
  embedding: number[],
  opts: { type?: string; description?: string | null } = {},
): boolean {
  const db = getDb();
  const contentHash = hashContent(content);

  const existing = db.prepare('SELECT id, content_hash FROM vector_embeddings WHERE memory_path = ?').get(memoryPath) as
    | { id: number; content_hash: string }
    | undefined;

  const now = Date.now();

  if (existing && existing.content_hash === contentHash) {
    // Content unchanged — just refresh indexed_at so mtime comparisons settle.
    db.prepare('UPDATE vector_embeddings SET indexed_at = ? WHERE id = ?').run(now, existing.id);
    return false;
  }

  const blob = serializeEmbedding(embedding);

  db.prepare(`
    INSERT INTO vector_embeddings (memory_path, filename, embedding, content_hash, type, description, indexed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(memory_path) DO UPDATE SET
      filename = excluded.filename,
      embedding = excluded.embedding,
      content_hash = excluded.content_hash,
      type = excluded.type,
      description = excluded.description,
      indexed_at = excluded.indexed_at
  `).run(memoryPath, filename, blob, contentHash, opts.type ?? null, opts.description ?? null, now);

  if (_vecLoaded) {
    const row = db.prepare('SELECT id FROM vector_embeddings WHERE memory_path = ?').get(memoryPath) as {
      id: number;
    };
    db.prepare('DELETE FROM vec_index WHERE rowid = ?').run(row.id);
    db.prepare('INSERT INTO vec_index (rowid, embedding) VALUES (?, ?)').run(row.id, blob);
  }

  return true;
}

/**
 * Remove index entries whose memory file no longer exists on disk.
 * Pass the full set of currently existing memory paths.
 *
 * @returns number of entries removed
 */
export function removeMissing(existingPaths: ReadonlySet<string>): number {
  const db = getDb();
  const rows = db.prepare('SELECT id, memory_path FROM vector_embeddings').all() as Array<{
    id: number;
    memory_path: string;
  }>;

  let removed = 0;
  for (const row of rows) {
    if (!existingPaths.has(row.memory_path)) {
      db.prepare('DELETE FROM vector_embeddings WHERE id = ?').run(row.id);
      if (_vecLoaded) db.prepare('DELETE FROM vec_index WHERE rowid = ?').run(row.id);
      removed++;
    }
  }
  return removed;
}

export interface VectorSearchResult {
  filePath: string;
  filename: string;
  score: number; // 0-1 cosine similarity
  type: string | null;
  description: string | null;
}

/**
 * Search vectors by semantic similarity. Uses vec0 KNN when the extension
 * loaded; otherwise brute-forces cosine similarity over stored embeddings.
 */
export function searchVectors(queryEmbedding: number[], topK = 5, threshold = 0.6): VectorSearchResult[] {
  const db = getDb();

  if (_vecLoaded) {
    try {
      const rows = db
        .prepare(`
          SELECT ve.memory_path, ve.filename, ve.type, ve.description, v.distance
          FROM vec_index v
          JOIN vector_embeddings ve ON ve.id = v.rowid
          WHERE v.embedding MATCH ? AND k = ?
          ORDER BY v.distance
        `)
        .all(serializeEmbedding(queryEmbedding), topK) as Array<{
        memory_path: string;
        filename: string;
        type: string | null;
        description: string | null;
        distance: number;
      }>;

      return rows
        .map(r => ({
          filePath: r.memory_path,
          filename: r.filename,
          type: r.type,
          description: r.description,
          // Normalized vectors: cosine = 1 - L2^2 / 2
          score: 1 - (r.distance * r.distance) / 2,
        }))
        .filter(r => r.score >= threshold);
    } catch (e) {
      logForDebugging(`[memdir] vec0 KNN failed, brute-forcing: ${e}`, { level: 'debug' });
    }
  }

  return bruteForceSearch(queryEmbedding, topK, threshold);
}

function bruteForceSearch(queryEmbedding: number[], topK: number, threshold: number): VectorSearchResult[] {
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

  return rows
    .map(r => ({
      filePath: r.memory_path,
      filename: r.filename,
      type: r.type,
      description: r.description,
      score: cosineSimilarity(queryEmbedding, deserializeEmbedding(r.embedding)),
    }))
    .filter(r => r.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Remove vectors not re-indexed within maxAgeDays. Since indexMemory
 * refreshes indexed_at on every sync pass, this only removes entries for
 * memories that stopped being scanned (e.g. dir moved).
 */
export function pruneOldVectors(maxAgeDays = 90): number {
  const db = getDb();
  const cutoff = Date.now() - maxAgeDays * 86_400_000;

  const stale = db.prepare('SELECT id FROM vector_embeddings WHERE indexed_at < ?').all(cutoff) as Array<{
    id: number;
  }>;
  for (const row of stale) {
    if (_vecLoaded) db.prepare('DELETE FROM vec_index WHERE rowid = ?').run(row.id);
  }
  const result = db.prepare('DELETE FROM vector_embeddings WHERE indexed_at < ?').run(cutoff);
  return result.changes || 0;
}

/** Clear all vectors (destructive). */
export function clearAllVectors(): void {
  const db = getDb();
  db.run('DELETE FROM vector_embeddings');
  if (_vecLoaded) db.run('DELETE FROM vec_index');
}

/** Get index statistics for the /index-admin command. */
export function getIndexStats(): {
  total: number;
  byType: Record<string, number>;
  vecExtensionLoaded: boolean;
  oldestIndexedAt: number | null;
  newestIndexedAt: number | null;
} {
  const db = getDb();
  const total = (db.prepare('SELECT COUNT(*) as c FROM vector_embeddings').get() as { c: number }).c;
  const typeRows = db.prepare('SELECT type, COUNT(*) as c FROM vector_embeddings GROUP BY type').all() as Array<{
    type: string | null;
    c: number;
  }>;
  const byType: Record<string, number> = {};
  for (const r of typeRows) byType[r.type || 'untyped'] = r.c;

  const oldest = db.prepare('SELECT MIN(indexed_at) as t FROM vector_embeddings').get() as { t: number | null };
  const newest = db.prepare('SELECT MAX(indexed_at) as t FROM vector_embeddings').get() as { t: number | null };

  return { total, byType, vecExtensionLoaded: _vecLoaded, oldestIndexedAt: oldest.t, newestIndexedAt: newest.t };
}

/** Close the database connection. */
export function closeIndex(): void {
  if (_db) {
    _db.close();
    _db = null;
    _vecLoaded = false;
  }
}
