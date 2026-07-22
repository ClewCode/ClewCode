import type { Database } from 'bun:sqlite';
import { getMemoryDb } from './db.js';
import { searchChunksFTS } from './store.js';
import type { MemorySearchResult } from './types.js';

// ── Embedding cache (in-memory LRU) ──
const embeddingCache = new Map<string, number[]>();
const _EMBEDDING_DIM = 384; // all-MiniLM-L6-v2 dimension

/**
 * Attempt to compute a query embedding using a local pipeline.
 * Returns null if the pipeline fails (graceful fallback).
 */
async function computeEmbedding(text: string): Promise<number[] | null> {
  const cached = embeddingCache.get(text);
  if (cached) return cached;

  try {
    // Try loading the Xenova Transformers pipeline
    const { pipeline } = await import('@xenova/transformers');
    const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      quantized: true,
    });
    const result = await extractor(text, { pooling: 'mean', normalize: true });
    const embedding = Array.from(result.data) as number[];
    embeddingCache.set(text, embedding);
    return embedding;
  } catch {
    // Pipeline unavailable (model not downloaded, missing deps, etc.)
    return null;
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0,
    magA = 0,
    magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

/** Ensure embedding table exists in the DB. */
function ensureEmbeddingTable(db: Database): void {
  db.run(`CREATE TABLE IF NOT EXISTS chunk_embeddings (
    chunk_id TEXT PRIMARY KEY,
    embedding BLOB NOT NULL,
    model TEXT NOT NULL DEFAULT 'all-MiniLM-L6-v2',
    FOREIGN KEY(chunk_id) REFERENCES chunks(id)
  )`);
}

/**
 * Search with semantic (embedding) boost on top of FTS5.
 * Falls back gracefully to FTS-only when embeddings are unavailable.
 */
export async function searchMemories(cwd: string, query: string, limit: number = 10): Promise<MemorySearchResult[]> {
  const db = getMemoryDb(cwd);
  const ftsMatches = searchChunksFTS(db, query, limit * 3);

  const results: MemorySearchResult[] = [];

  // Try computing query embedding
  const queryEmb = await computeEmbedding(query);

  // If embeddings available, ensure table and load chunk embeddings
  let chunkEmbeddings: Map<string, number[]> | null = null;
  if (queryEmb) {
    ensureEmbeddingTable(db);
    chunkEmbeddings = new Map();
    const embRows = db.query('SELECT chunk_id, embedding FROM chunk_embeddings').all() as Array<{
      chunk_id: string;
      embedding: Uint8Array;
    }>;
    for (const r of embRows) {
      try {
        const arr = Array.from(
          new Float32Array(r.embedding.buffer, r.embedding.byteOffset, r.embedding.byteLength / 4),
        );
        chunkEmbeddings.set(r.chunk_id, arr);
      } catch {
        /* skip corrupted */
      }
    }
  }

  for (const match of ftsMatches) {
    const chunkRow = db.query('SELECT * FROM chunks WHERE id = ?').get(match.id) as Record<string, any> | undefined;
    if (!chunkRow) continue;

    const sourceRow = db.query('SELECT * FROM sources WHERE id = ?').get(match.sourceId) as
      | Record<string, any>
      | undefined;
    if (!sourceRow) continue;

    const priority = sourceRow.truth_priority || 50;
    const priorityFactor = priority / 100;

    let recencyFactor = 0;
    const updatedAt = new Date(sourceRow.updated_at).getTime();
    const ageMs = Date.now() - updatedAt;
    if (ageMs < 24 * 60 * 60 * 1000) recencyFactor = 0.15;
    else if (ageMs < 7 * 24 * 60 * 60 * 1000) recencyFactor = 0.08;

    // Semantic boost: cosine similarity against query embedding
    let semanticBoost = 0;
    if (queryEmb && chunkEmbeddings) {
      const chunkEmb = chunkEmbeddings.get(match.id);
      if (chunkEmb) {
        semanticBoost = cosineSimilarity(queryEmb, chunkEmb) * 0.3;
      }
    }

    const score = Math.min(0.4 + priorityFactor * 0.35 + recencyFactor + semanticBoost, 1.0);

    results.push({
      id: match.id,
      title: sourceRow.title || sourceRow.uri,
      sourcePath: sourceRow.source_path || sourceRow.uri,
      sourceType: sourceRow.source_type,
      excerpt: chunkRow.markdown,
      score,
      contentHash: chunkRow.content_hash,
      lastSeenAt: sourceRow.last_seen_at || new Date().toISOString(),
      stale: false,
    });
  }

  // Sort by score descending
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}
