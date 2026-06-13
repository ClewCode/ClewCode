/**
 * In-memory search result cache with TTL.
 * Caches GrepTool/GlobTool results so identical searches within a session
 * return instantly instead of re-executing ripgrep.
 *
 * Only caches files_with_matches mode (lightweight — just file paths).
 * Content mode is too memory-heavy per result to cache.
 */

const DEFAULT_TTL_MS = 30_000; // 30 seconds

interface CacheEntry {
  results: string[];
  timestamp: number;
  ttl: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * Generate a deterministic cache key from GrepTool search parameters.
 */
export function searchCacheKey({
  pattern,
  absolutePath,
  glob,
  type,
  outputMode,
  multiline,
  caseInsensitive,
}: {
  pattern: string;
  absolutePath: string;
  glob?: string;
  type?: string;
  outputMode: string;
  multiline?: boolean;
  caseInsensitive?: boolean;
}): string {
  return JSON.stringify({
    p: pattern,
    d: absolutePath,
    g: glob ?? '',
    t: type ?? '',
    m: outputMode,
    ml: !!multiline,
    ci: !!caseInsensitive,
  });
}

/**
 * Returns cached results if a fresh entry exists, or null otherwise.
 * Expired entries are removed on access.
 */
export function getCachedSearch(key: string): string[] | null {
  const entry = cache.get(key);
  if (!entry) return null;

  if (Date.now() - entry.timestamp > entry.ttl) {
    cache.delete(key);
    return null;
  }

  return entry.results;
}

/**
 * Store search results in cache.
 */
export function setCachedSearch(key: string, results: string[], ttl = DEFAULT_TTL_MS): void {
  cache.set(key, {
    results,
    timestamp: Date.now(),
    ttl,
  });
}

/**
 * Clear all expired cache entries. Called on each cache lookup automatically,
 * but can be invoked manually to free memory.
 */
export function clearExpiredCache(): number {
  const now = Date.now();
  let cleared = 0;
  for (const [key, entry] of cache) {
    if (now - entry.timestamp > entry.ttl) {
      cache.delete(key);
      cleared++;
    }
  }
  return cleared;
}

/**
 * Clear all cache entries (useful for testing).
 */
export function clearAllCache(): void {
  cache.clear();
}

/**
 * Returns the number of entries currently in the cache (for diagnostics).
 */
export function cacheSize(): number {
  return cache.size;
}
