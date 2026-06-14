import { LRUCache } from 'lru-cache';
import { normalize } from 'path';
// Default max entries for read file state caches
export const READ_FILE_STATE_CACHE_SIZE = 100;
// Default size limit for file state caches (25MB)
// This prevents unbounded memory growth from large file contents
const DEFAULT_MAX_CACHE_SIZE_BYTES = 25 * 1024 * 1024;
/**
 * A file state cache that normalizes all path keys before access.
 * This ensures consistent cache hits regardless of whether callers pass
 * relative vs absolute paths with redundant segments (e.g. /foo/../bar)
 * or mixed path separators on Windows (/ vs \).
 */
export class FileStateCache {
    cache;
    constructor(maxEntries, maxSizeBytes) {
        this.cache = new LRUCache({
            max: maxEntries,
            maxSize: maxSizeBytes,
            sizeCalculation: value => Math.max(1, Buffer.byteLength(value.content)),
        });
    }
    get(key) {
        return this.cache.get(normalize(key));
    }
    set(key, value) {
        this.cache.set(normalize(key), value);
        return this;
    }
    has(key) {
        return this.cache.has(normalize(key));
    }
    delete(key) {
        return this.cache.delete(normalize(key));
    }
    clear() {
        this.cache.clear();
    }
    get size() {
        return this.cache.size;
    }
    get max() {
        return this.cache.max;
    }
    get maxSize() {
        return this.cache.maxSize;
    }
    get calculatedSize() {
        return this.cache.calculatedSize;
    }
    keys() {
        return this.cache.keys();
    }
    entries() {
        return this.cache.entries();
    }
    dump() {
        return this.cache.dump();
    }
    load(entries) {
        this.cache.load(entries);
    }
}
/**
 * Factory function to create a size-limited FileStateCache.
 * Uses LRUCache's built-in size-based eviction to prevent memory bloat.
 * Note: Images are not cached (see FileReadTool) so size limit is mainly
 * for large text files, notebooks, and other editable content.
 */
export function createFileStateCacheWithSizeLimit(maxEntries, maxSizeBytes = DEFAULT_MAX_CACHE_SIZE_BYTES) {
    return new FileStateCache(maxEntries, maxSizeBytes);
}
// Helper function to convert cache to object (used by compact.ts)
export function cacheToObject(cache) {
    return Object.fromEntries(cache.entries());
}
// Helper function to get all keys from cache (used by several components)
export function cacheKeys(cache) {
    return Array.from(cache.keys());
}
// Helper function to clone a FileStateCache
// Preserves size limit configuration from the source cache
export function cloneFileStateCache(cache) {
    const cloned = createFileStateCacheWithSizeLimit(cache.max, cache.maxSize);
    cloned.load(cache.dump());
    return cloned;
}
// Merge two file state caches, with more recent entries (by timestamp) overriding older ones
export function mergeFileStateCaches(first, second) {
    const merged = cloneFileStateCache(first);
    for (const [filePath, fileState] of second.entries()) {
        const existing = merged.get(filePath);
        // Only override if the new entry is more recent
        if (!existing || fileState.timestamp > existing.timestamp) {
            merged.set(filePath, fileState);
        }
    }
    return merged;
}
