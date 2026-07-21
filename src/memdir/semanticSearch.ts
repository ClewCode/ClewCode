/**
 * Semantic Search for Memory System
 *
 * Uses @xenova/transformers to create embeddings for memory files
 * and perform semantic search with cross-lingual support.
 * Embeddings are indexed in sqlite-vec for fast O(log N) ANN retrieval.
 *
 * Model: ibm-granite/granite-embedding-97m-multilingual-r2
 * - 100+ languages supported (including Thai)
 * - 97M params (~25MB quantized)
 * - Fast inference on CPU
 *
 * Storage: ~/.clew/memory/vectors.db with sqlite-vec extension
 * - Persistent across sessions
 * - Automatic invalidation on file changes (content_hash)
 */

import { env, pipeline } from '@xenova/transformers';
import { readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { getClewConfigHomeDir } from '../utils/envUtils.js';
import { type MemoryHeader, scanMemoryFiles } from './memoryScan.js';
import { getAutoMemPath } from './paths.js';
import { indexMemory, needsIndexing, removeMissing, searchVectors } from './semanticIndex.js';

// Configure Xenova
env.allowLocalModels = false;
env.useBrowserCache = false;
// Cache models in ~/.clew/models to persist across sessions
// Note: cacheDir type may vary by version, so we use type assertion
try {
  (env as any).cacheDir = join(getClewConfigHomeDir(), 'models');
} catch {
  // cacheDir may not be supported in all versions
}

// Singleton extractor
let extractor: Awaited<ReturnType<typeof pipeline>> | null = null;

/**
 * Get or create the embedding extractor pipeline.
 * Loads the model on first call, then reuses it.
 */
async function getExtractor() {
  if (!extractor) {
    extractor = await pipeline('feature-extraction', 'Xenova/granite-embedding-97m-multilingual-r2', {
      quantized: true,
    });
  }
  return extractor;
}

/**
 * Create embedding vector for a text string.
 * Returns normalized 768-dimensional vector.
 */
export async function createEmbedding(text: string): Promise<number[]> {
  const ext = await getExtractor();
  // Call pipeline with text and options (type assertion needed for complex union type)
  const output = await ext(text, { pooling: 'mean' } as any);

  // Extract data from output (handle different output types)
  let embedding: number[];
  if ('data' in output && output.data) {
    embedding = Array.from(output.data as Float32Array) as number[];
  } else if (typeof output === 'object' && output !== null) {
    const values = Object.values(output).filter(v => typeof v === 'number');
    if (values.length > 0) {
      embedding = values as number[];
    } else {
      throw new Error('Failed to extract embedding data from model output');
    }
  } else {
    throw new Error('Failed to extract embedding data from model output');
  }

  // Normalize the embedding (L2 normalization)
  const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
  if (norm > 0) {
    return embedding.map(v => v / norm);
  }
  return embedding;
}

/**
 * Cosine similarity between two vectors.
 * Returns value between -1 and 1 (higher = more similar).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
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
 * Embedding cache entry.
 * Stored as JSON alongside memory files.
 */
interface EmbeddingCache {
  text: string;
  embedding: number[];
  mtimeMs: number;
  createdAt: number;
}

/**
 * Ensure a memory file is present and current in the vector index.
 * Reads the file, reuses a legacy .embedding.json if still valid,
 * otherwise computes a fresh embedding, then upserts into the index.
 */
async function ensureIndexed(header: MemoryHeader): Promise<void> {
  const content = await readFile(header.filePath, 'utf-8');
  const preview = content.slice(0, 1000);

  // Reuse legacy file cache if still valid (backward compat, avoids re-embedding)
  let embedding: number[] | null = null;
  try {
    const cached: EmbeddingCache = JSON.parse(await readFile(`${header.filePath}.embedding.json`, 'utf-8'));
    if (cached.mtimeMs === header.mtimeMs) {
      embedding = cached.embedding;
    }
  } catch {
    // No legacy cache
  }

  if (!embedding) {
    embedding = await createEmbedding(preview);
  }

  indexMemory(header.filePath, header.filename, content, embedding, {
    type: header.type,
    description: header.description,
  });
}

/**
 * Incrementally sync the vector index with the memory directory:
 * embed new/changed files (mtime vs indexed_at) and drop entries for
 * deleted files. Cheap when nothing changed (no file reads, one DB
 * query per header).
 */
export async function syncIndex(memoryDir: string): Promise<{ indexed: number; removed: number }> {
  const headers = await scanMemoryFiles(memoryDir, new AbortController().signal);

  let indexed = 0;
  for (const header of headers) {
    if (needsIndexing(header.filePath, header.mtimeMs)) {
      try {
        await ensureIndexed(header);
        indexed++;
      } catch {
        // Skip unreadable files
      }
    }
  }

  const removed = removeMissing(new Set(headers.map(h => h.filePath)));
  return { indexed, removed };
}

/**
 * Result from a semantic memory file search.
 */
export interface SemanticMemoryResult {
  file: string;
  filePath: string;
  type: string | undefined;
  description: string | null;
  score: number;
  content: string;
}

/**
 * Search memories semantically using the sqlite-vec index.
 *
 * Before querying, incrementally syncs the index with the memory
 * directory (new/changed files get embedded; deleted files drop out),
 * so results always reflect current disk state. The sync is a no-op
 * when nothing changed. Query embedding and sync run concurrently.
 *
 * @param query - Search query (any language)
 * @param topK - Number of results to return
 * @param threshold - Minimum similarity score (0-1)
 * @returns Sorted list of relevant memories by relevance score
 */
export async function searchMemories(query: string, topK = 5, threshold = 0.6): Promise<SemanticMemoryResult[]> {
  const memoryDir = getAutoMemPath();
  if (!memoryDir) return [];

  // BUG #7: Ensure syncIndex completes before search (serialize to guarantee memory is indexed first)
  await syncIndex(memoryDir);
  const queryEmbed = await createEmbedding(query);

  const vectorResults = searchVectors(queryEmbed, topK, threshold);
  if (vectorResults.length === 0) return [];

  // Load content for preview from matched files
  const results = await Promise.allSettled(
    vectorResults.map(async (vr): Promise<SemanticMemoryResult | null> => {
      try {
        const content = await readFile(vr.filePath, 'utf-8');
        return {
          file: vr.filename,
          filePath: vr.filePath,
          type: vr.type ?? undefined,
          description: vr.description,
          score: vr.score,
          content: content.slice(0, 500), // Preview
        };
      } catch {
        return null;
      }
    }),
  );

  return results
    .filter((r): r is PromiseFulfilledResult<SemanticMemoryResult | null> => r.status === 'fulfilled')
    .map(r => r.value)
    .filter((r): r is SemanticMemoryResult => r !== null);
}

/**
 * Batch index all memories into sqlite-vec.
 * Scans memory directory and indexes embeddings.
 * Useful for initial setup or after bulk memory additions.
 *
 * @returns Number of memories indexed
 */
export async function embedAllMemories(): Promise<number> {
  const memoryDir = getAutoMemPath();
  if (!memoryDir) return 0;

  const { indexed } = await syncIndex(memoryDir);
  return indexed;
}

/**
 * Migrate legacy .embedding.json files into the sqlite-vec index.
 * Runs a full sync (which reuses valid legacy caches instead of
 * re-embedding), then deletes the legacy files.
 *
 * @returns Number of legacy files removed
 */
export async function migrateLegacyEmbeddings(): Promise<number> {
  const memoryDir = getAutoMemPath();
  if (!memoryDir) return 0;

  await syncIndex(memoryDir);
  return clearLegacyEmbeddingCache();
}

/**
 * Clear legacy embedding files and reinitialize index.
 * Useful for resetting after model updates or troubleshooting.
 * Keeps the sqlite-vec index intact.
 *
 * @returns Number of legacy files cleared
 */
export async function clearLegacyEmbeddingCache(): Promise<number> {
  const memoryDir = getAutoMemPath();
  if (!memoryDir) return 0;

  const { readdir } = await import('fs/promises');
  const entries = await readdir(memoryDir, { recursive: true });
  const embedFiles = entries.filter(f => typeof f === 'string' && f.endsWith('.embedding.json'));

  let count = 0;
  for (const file of embedFiles) {
    try {
      await unlink(join(memoryDir, file));
      count++;
    } catch {
      // Skip files that can't be deleted
    }
  }

  return count;
}

/**
 * Export index management functions for CLI.
 */
export { clearAllVectors, closeIndex, getIndexStats, pruneOldVectors } from './semanticIndex.js';
