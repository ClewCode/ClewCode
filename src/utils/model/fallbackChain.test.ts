import { describe, expect, test } from 'bun:test';
import { type FallbackEntry, resolveNextFallback } from './fallbackChain.js';

// resolveNextFallback is the pure decision function at the heart of the chain:
// given a chain, a cursor, and the active provider, which entry runs next.
// The add/remove/move helpers are thin settings writes and are covered by the
// command-level behavior instead of mocking the settings layer here.
describe('resolveNextFallback', () => {
  const chain: FallbackEntry[] = [
    { model: 'model-a', effort: 'low' },
    { provider: 'anthropic', model: 'model-b' },
    { provider: 'openai', model: 'model-c' },
  ];

  test('returns the first entry when starting at index 0', () => {
    const result = resolveNextFallback(chain, 0, 'anthropic');
    expect(result?.entry.model).toBe('model-a');
    expect(result?.isSameProvider).toBe(true);
  });

  test('carries the effort of the chosen entry', () => {
    expect(resolveNextFallback(chain, 0, 'anthropic')?.entry.effort).toBe('low');
  });

  test('treats an entry with no provider as same-provider', () => {
    // { model: 'model-a' } has no provider pin, so it is valid under any provider.
    expect(resolveNextFallback(chain, 0, 'openai')?.entry.model).toBe('model-a');
  });

  test('matches an entry pinned to the active provider', () => {
    const result = resolveNextFallback(chain, 1, 'anthropic');
    expect(result?.entry.model).toBe('model-b');
    expect(result?.isSameProvider).toBe(true);
  });

  test('skips cross-provider entries rather than switching provider mid-retry', () => {
    // From index 2 the only remaining entry is pinned to openai, so an
    // anthropic session has nothing left it may safely use.
    expect(resolveNextFallback(chain, 2, 'anthropic')).toBeUndefined();
  });

  test('skips past a cross-provider entry to reach a later usable one', () => {
    const mixed: FallbackEntry[] = [
      { provider: 'openai', model: 'skip-me' },
      { provider: 'anthropic', model: 'use-me' },
    ];
    expect(resolveNextFallback(mixed, 0, 'anthropic')?.entry.model).toBe('use-me');
  });

  test('reports the index it landed on, not the index it was asked to resume from', () => {
    // The caller advances its cursor to this index. If it instead incremented
    // by one it would ask for index 1 next time and get 'use-me' again,
    // retrying the same model forever instead of exhausting the chain.
    const mixed: FallbackEntry[] = [
      { provider: 'openai', model: 'skip-me' },
      { provider: 'anthropic', model: 'use-me' },
    ];
    const result = resolveNextFallback(mixed, 0, 'anthropic');
    expect(result?.index).toBe(1);
    // Resuming after the reported index correctly reports the chain exhausted.
    expect(resolveNextFallback(mixed, result!.index + 1, 'anthropic')).toBeUndefined();
  });

  test('walks the whole chain without repeating an entry', () => {
    const seen: string[] = [];
    let cursor = 0;
    for (;;) {
      const next = resolveNextFallback(chain, cursor, 'anthropic');
      if (!next) break;
      seen.push(next.entry.model);
      cursor = next.index + 1;
    }
    // model-c is pinned to openai, so an anthropic session never reaches it.
    expect(seen).toEqual(['model-a', 'model-b']);
  });

  test('returns undefined when the cursor is past the end', () => {
    expect(resolveNextFallback(chain, chain.length, 'anthropic')).toBeUndefined();
  });

  test('returns undefined for an empty chain', () => {
    expect(resolveNextFallback([], 0, 'anthropic')).toBeUndefined();
  });
});
