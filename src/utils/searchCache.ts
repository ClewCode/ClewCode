/**
 * In-memory search result cache with TTL and LRU eviction.
 * Caches GrepTool/GlobTool results so identical searches within a session
 * return instantly instead of re-executing ripgrep.
 *
 * Cache keys include output mode and context settings, so content-mode Grep
 * calls do not collide with file-list searches or different context windows.
 *
 * LRU eviction: when the cache exceeds MAX_ENTRIES, the oldest entries
 * (by last access) are evicted first. This prevents unbounded memory growth
 * in long sessions with many unique searches.
 */

const DEFAULT_TTL_MS = 120_000; // 2 minutes
const MAX_ENTRIES = 500; // Hard limit to prevent memory leak

interface CacheEntry {
  results: string[];
  timestamp: number;
  ttl: number;
  lastAccess: number; // LRU ordering
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
  contextBefore,
  contextAfter,
  contextAround,
  showLineNumbers,
}: {
  pattern: string;
  absolutePath: string;
  glob?: string;
  type?: string;
  outputMode: string;
  multiline?: boolean;
  caseInsensitive?: boolean;
  contextBefore?: number;
  contextAfter?: number;
  contextAround?: number;
  showLineNumbers?: boolean;
}): string {
  return JSON.stringify({
    p: pattern,
    d: absolutePath,
    g: glob ?? '',
    t: type ?? '',
    m: outputMode,
    ml: !!multiline,
    ci: !!caseInsensitive,
    b: contextBefore ?? null,
    a: contextAfter ?? null,
    c: contextAround ?? null,
    n: showLineNumbers ?? null,
  });
}

/**
 * Generate a deterministic cache key for GlobTool searches.
 */
export function globCacheKey({
  pattern,
  absolutePath,
  limit,
  offset,
}: {
  pattern: string;
  absolutePath: string;
  limit: number;
  offset: number;
}): string {
  return JSON.stringify({
    kind: 'glob',
    p: pattern,
    d: absolutePath,
    l: limit,
    o: offset,
  });
}

/**
 * Evict the least-recently-used entries until we're under MAX_ENTRIES.
 * Scans all entries sorted by lastAccess (ascending), removes oldest.
 */
function evictLru(): void {
  if (cache.size <= MAX_ENTRIES) return;

  const entries = [...cache.entries()]
    .map(([key, entry]) => ({ key, lastAccess: entry.lastAccess }))
    .sort((a, b) => a.lastAccess - b.lastAccess);

  const toEvict = cache.size - MAX_ENTRIES;
  for (let i = 0; i < toEvict && i < entries.length; i++) {
    cache.delete(entries[i]!.key);
  }
}

/**
 * Returns cached results if a fresh entry exists, or null otherwise.
 * Expired entries are removed on access. LRU timestamp is updated on hit.
 */
export function getCachedSearch(key: string): string[] | null {
  const entry = cache.get(key);
  if (!entry) return null;

  entry.lastAccess = Date.now();

  if (Date.now() - entry.timestamp > entry.ttl) {
    cache.delete(key);
    return null;
  }

  return entry.results;
}

/**
 * Store search results in cache.
 * Automatically evicts oldest entries if cache exceeds MAX_ENTRIES.
 */
export function setCachedSearch(key: string, results: string[], ttl = DEFAULT_TTL_MS): void {
  const now = Date.now();
  cache.set(key, {
    results,
    timestamp: now,
    ttl,
    lastAccess: now,
  });

  if (cache.size > MAX_ENTRIES) {
    evictLru();
  }
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
