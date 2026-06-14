/**
 * Returns a memoized factory function that constructs the value on first call.
 * Used to defer Zod schema construction from module init time to first access.
 */
export function lazySchema(factory) {
    let cached;
    return () => (cached ??= factory());
}
