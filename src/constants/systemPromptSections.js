import { clearBetaHeaderLatches, clearSystemPromptSectionState, getSystemPromptSectionCache, setSystemPromptSectionCacheEntry, } from '../bootstrap/state.js';
/**
 * Create a memoized system prompt section.
 * Computed once, cached until /clear or /compact.
 */
export function systemPromptSection(name, compute) {
    return { name, compute, cacheBreak: false };
}
/**
 * Create a volatile system prompt section that recomputes every turn.
 * This WILL break the prompt cache when the value changes.
 * Requires a reason explaining why cache-breaking is necessary.
 */
export function DANGEROUS_uncachedSystemPromptSection(name, compute, _reason) {
    return { name, compute, cacheBreak: true };
}
/**
 * Resolve all system prompt sections, returning prompt strings.
 */
export async function resolveSystemPromptSections(sections) {
    const cache = getSystemPromptSectionCache();
    return Promise.all(sections.map(async (s) => {
        if (!s.cacheBreak && cache.has(s.name)) {
            return cache.get(s.name) ?? null;
        }
        const value = await s.compute();
        setSystemPromptSectionCacheEntry(s.name, value);
        return value;
    }));
}
/**
 * Clear all system prompt section state. Called on /clear and /compact.
 * Also resets beta header latches so a fresh conversation gets fresh
 * evaluation of AFK/fast-mode/cache-editing headers.
 */
export function clearSystemPromptSections() {
    clearSystemPromptSectionState();
    clearBetaHeaderLatches();
}
