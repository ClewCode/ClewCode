import {
  clearBetaHeaderLatches,
  clearSystemPromptSectionState,
  getSystemPromptSectionCache,
  setSystemPromptSectionCacheEntry,
} from '../bootstrap/state.js';

type ComputeFn = () => string | null | Promise<string | null>;

type SystemPromptSection = {
  name: string;
  compute: ComputeFn;
  cacheBreak: boolean;
  /** Values the computed content varies with. Part of the cache key. */
  deps?: readonly string[];
};

/** NUL — cannot occur in a section name or a model id, so it cannot collide. */
const CACHE_KEY_SEPARATOR = '\u0000';

/**
 * Cache key for a section. Sections whose output depends on mutable session
 * state (the active model, most importantly) must declare those values as
 * `deps` — the cache is only cleared on /clear and /compact, so a name-only key
 * survives a mid-session `/model` switch and keeps serving content describing
 * the *previous* model.
 */
export function cacheKeyFor(section: Pick<SystemPromptSection, 'name' | 'deps'>): string {
  if (!section.deps || section.deps.length === 0) return section.name;
  return [section.name, ...section.deps].join(CACHE_KEY_SEPARATOR);
}

/**
 * Create a memoized system prompt section.
 * Computed once per distinct `deps` tuple, cached until /clear or /compact.
 *
 * Pass `deps` whenever `compute` closes over something that can change during a
 * session (e.g. the model id). Omitting them yields stale content on change.
 */
export function systemPromptSection(name: string, compute: ComputeFn, deps?: readonly string[]): SystemPromptSection {
  return { name, compute, cacheBreak: false, deps };
}

/**
 * Create a volatile system prompt section that recomputes every turn.
 * This WILL break the prompt cache when the value changes.
 * Requires a reason explaining why cache-breaking is necessary.
 */
export function DANGEROUS_uncachedSystemPromptSection(
  name: string,
  compute: ComputeFn,
  _reason: string,
): SystemPromptSection {
  return { name, compute, cacheBreak: true };
}

/**
 * Resolve all system prompt sections, returning prompt strings.
 */
export async function resolveSystemPromptSections(sections: SystemPromptSection[]): Promise<(string | null)[]> {
  const cache = getSystemPromptSectionCache();

  return Promise.all(
    sections.map(async s => {
      const key = cacheKeyFor(s);
      if (!s.cacheBreak && cache.has(key)) {
        return cache.get(key) ?? null;
      }
      const value = await s.compute();
      setSystemPromptSectionCacheEntry(key, value);
      return value;
    }),
  );
}

/**
 * Clear all system prompt state. Called on /clear and /compact.
 * Also resets beta header latches so a fresh conversation gets fresh
 * evaluation of AFK/cache-editing headers.
 */
export function clearSystemPromptSections(): void {
  clearSystemPromptSectionState();
  clearBetaHeaderLatches();
}
