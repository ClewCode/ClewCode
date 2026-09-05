import { logForDebugging } from './debug.js';
import { isFsInaccessible } from './errors.js';
import { detectEncodingForResolvedPath } from './fileRead.js';
import { getFsImplementation, safeResolvePath } from './fsOperations.js';
import { logError } from './log.js';

/**
 * Detects a file's text encoding. Lives here (not file.ts) so the
 * file.ts ↔ fileReadCache.ts import cycle stays broken: file.ts consumes
 * the cache, and the cache no longer imports file.ts back.
 */
export function detectFileEncoding(filePath: string): BufferEncoding {
  try {
    const fs = getFsImplementation();
    const { resolvedPath } = safeResolvePath(fs, filePath);
    return detectEncodingForResolvedPath(resolvedPath);
  } catch (error) {
    if (isFsInaccessible(error)) {
      logForDebugging(`detectFileEncoding failed for expected reason: ${error.code}`, {
        level: 'debug',
      });
    } else {
      logError(error);
    }
    return 'utf8';
  }
}

type CachedFileData = {
  content: string;
  encoding: BufferEncoding;
  mtime: number;
};

/**
 * A simple in-memory cache for file contents with automatic invalidation based on modification time.
 * This eliminates redundant file reads in FileEditTool operations.
 */
class FileReadCache {
  private cache = new Map<string, CachedFileData>();
  private readonly maxCacheSize = 1000;

  /**
   * Reads a file with caching. Returns both content and encoding.
   * Cache key includes file path and modification time for automatic invalidation.
   */
  readFile(filePath: string): { content: string; encoding: BufferEncoding } {
    const fs = getFsImplementation();

    // Get file stats for cache invalidation
    let stats;
    try {
      stats = fs.statSync(filePath);
    } catch (error) {
      // File was deleted, remove from cache and re-throw
      this.cache.delete(filePath);
      throw error;
    }

    const cacheKey = filePath;
    const cachedData = this.cache.get(cacheKey);

    // Check if we have valid cached data
    if (cachedData && cachedData.mtime === stats.mtimeMs) {
      return {
        content: cachedData.content,
        encoding: cachedData.encoding,
      };
    }

    // Cache miss or stale data - read the file
    const encoding = detectFileEncoding(filePath);
    const content = fs.readFileSync(filePath, { encoding }).replaceAll('\r\n', '\n');

    // Update cache
    this.cache.set(cacheKey, {
      content,
      encoding,
      mtime: stats.mtimeMs,
    });

    // Evict oldest entries if cache is too large
    if (this.cache.size > this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    return { content, encoding };
  }

  /**
   * Clears the entire cache. Useful for testing or memory management.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Removes a specific file from the cache.
   */
  invalidate(filePath: string): void {
    this.cache.delete(filePath);
  }

  /**
   * Gets cache statistics for debugging/monitoring.
   */
  getStats(): { size: number; entries: string[] } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys()),
    };
  }
}

// Export a singleton instance
export const fileReadCache = new FileReadCache();
