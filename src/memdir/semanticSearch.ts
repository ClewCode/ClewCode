/**
 * Semantic Search for Memory System
 *
 * Uses @xenova/transformers to create embeddings for memory files
 * and perform semantic search with cross-lingual support.
 *
 * Model: ibm-granite/granite-embedding-97m-multilingual-r2
 * - 100+ languages supported (including Thai)
 * - 97M params (~25MB quantized)
 * - Fast inference on CPU
 */

import { env, pipeline } from '@xenova/transformers';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { getClewConfigHomeDir } from '../utils/envUtils.js';
import { type MemoryHeader, scanMemoryFiles } from './memoryScan.js';
import { getAutoMemPath } from './paths.js';

// Configure Xenova
env.allowLocalModels = false;
env.useBrowserCache = false;
// Cache models in ~/.claude/models to persist across sessions
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
    console.log('[Memory] Loading embedding model (granite-97m-multilingual-r2)...');
    extractor = await pipeline('feature-extraction', 'Xenova/granite-embedding-97m-multilingual-r2', {
      quantized: true,
    });
    console.log('[Memory] Embedding model loaded.');
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
 * Get or create embedding for a memory file.
 * Caches embeddings to avoid recomputing on every search.
 */
async function getOrCreateEmbedding(header: MemoryHeader, content: string): Promise<number[]> {
  const embedPath = `${header.filePath}.embedding.json`;

  try {
    const embedContent = await readFile(embedPath, 'utf-8');
    const cached: EmbeddingCache = JSON.parse(embedContent);

    // Return cached embedding if file hasn't changed
    if (cached.mtimeMs === header.mtimeMs) {
      return cached.embedding;
    }
  } catch {
    // No cache or invalid cache
  }

  // Create new embedding
  const embedding = await createEmbedding(content);

  // Save to cache
  const cache: EmbeddingCache = {
    text: content.slice(0, 500), // Store first 500 chars for debugging
    embedding,
    mtimeMs: header.mtimeMs,
    createdAt: Date.now(),
  };

  await writeFile(embedPath, JSON.stringify(cache));

  return embedding;
}

/**
 * Memory search result.
 */
export interface MemorySearchResult {
  file: string;
  filePath: string;
  type: string | undefined;
  description: string | null;
  score: number;
  content: string;
}

/**
 * Search memories semantically.
 *
 * @param query - Search query (any language)
 * @param topK - Number of results to return
 * @param threshold - Minimum similarity score (0-1)
 * @returns Sorted list of relevant memories
 */
export async function searchMemories(query: string, topK = 5, threshold = 0.6): Promise<MemorySearchResult[]> {
  const memoryDir = getAutoMemPath();
  if (!memoryDir) return [];

  // Create query embedding
  const queryEmbed = await createEmbedding(query);

  // Scan memory files
  const headers = await scanMemoryFiles(memoryDir, new AbortController().signal);
  if (headers.length === 0) return [];

  // Search in parallel
  const results = await Promise.allSettled(
    headers.map(async (header): Promise<MemorySearchResult | null> => {
      try {
        // Read file content (first 1000 chars for embedding)
        const content = await readFile(header.filePath, 'utf-8');
        const preview = content.slice(0, 1000);

        // Get or create embedding
        const embedding = await getOrCreateEmbedding(header, preview);

        // Calculate similarity
        const score = cosineSimilarity(queryEmbed, embedding);

        if (score < threshold) return null;

        return {
          file: header.filename,
          filePath: header.filePath,
          type: header.type,
          description: header.description,
          score,
          content: content.slice(0, 500), // Preview
        };
      } catch {
        return null;
      }
    }),
  );

  // Filter, sort, and return top K
  return results
    .filter((r): r is PromiseFulfilledResult<MemorySearchResult | null> => r.status === 'fulfilled')
    .map(r => r.value)
    .filter((r): r is MemorySearchResult => r !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/**
 * Batch embed all memories (pre-compute for faster search).
 * Useful for initial setup or after bulk updates.
 */
export async function embedAllMemories(): Promise<number> {
  const memoryDir = getAutoMemPath();
  if (!memoryDir) return 0;

  const headers = await scanMemoryFiles(memoryDir, new AbortController().signal);
  let count = 0;

  for (const header of headers) {
    try {
      const content = await readFile(header.filePath, 'utf-8');
      await getOrCreateEmbedding(header, content.slice(0, 1000));
      count++;
    } catch {
      // Skip files that can't be read
    }
  }

  return count;
}

/**
 * Clear embedding cache.
 * Useful for forcing re-embedding after model updates.
 */
export async function clearEmbeddingCache(): Promise<number> {
  const memoryDir = getAutoMemPath();
  if (!memoryDir) return 0;

  const { readdir, unlink } = await import('fs/promises');
  const entries = await readdir(memoryDir, { recursive: true });
  const embedFiles = entries.filter(f => f.endsWith('.embedding.json'));

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
