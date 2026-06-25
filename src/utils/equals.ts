/**
 * Deep comparison of two values using simple recursive check.
 * Covers the subset of lodash isEqual used in this codebase.
 */
export function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!isEqual(a[i], b[i])) return false;
    }
    return true;
  }

  if (typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const keysA = Object.keys(a as Record<string, unknown>);
    const keysB = Object.keys(b as Record<string, unknown>);
    if (keysA.length !== keysB.length) return false;
    for (const key of keysA) {
      if (!Object.hasOwn(b, key)) return false;
      if (!isEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) return false;
    }
    return true;
  }

  return false;
}

/**
 * Simple memoize function that caches based on the first argument.
 * Supports .cache.clear() for cache invalidation.
 */
export function memoize<T extends (...args: unknown[]) => unknown>(fn: T): T & { cache: { clear: () => void } } {
  const cache = new Map<string, unknown>();

  const memoized = ((...args: unknown[]): unknown => {
    const key = typeof args[0] !== 'undefined' ? String(args[0]) : '__default__';
    if (cache.has(key)) return cache.get(key);
    const result = fn(...args);
    cache.set(key, result);
    return result;
  }) as T & { cache: { clear: () => void } };

  memoized.cache = {
    clear: () => cache.clear(),
  };

  return memoized;
}
