import { describe, expect, test } from 'bun:test';
import { getProviderCapabilityEntry, resolveProviderModelInfo } from './providerCapabilities.js';
import { PROVIDER_IDS } from './providerRegistry.js';

describe('resolveProviderModelInfo', () => {
  test('resolves an exact id', () => {
    const info = resolveProviderModelInfo('openai', 'gpt-5.5');
    expect(info?.id).toBe('gpt-5.5');
  });

  test('is case-insensitive', () => {
    expect(resolveProviderModelInfo('openai', 'GPT-5.5')?.id).toBe('gpt-5.5');
  });

  test('ignores the client-side [1m] marker', () => {
    expect(resolveProviderModelInfo('openai', 'gpt-5.5[1m]')?.id).toBe('gpt-5.5');
  });

  test('prefers the longest match so a prefix id does not shadow a longer one', () => {
    const entry = getProviderCapabilityEntry('openai');
    const ids = entry.models.map(m => m.id);
    // Only meaningful if the registry actually has a longer id extending another.
    const shadowed = ids.find(id => ids.some(other => other !== id && other.startsWith(id)));
    if (!shadowed) return;
    const longer = ids
      .filter(other => other !== shadowed && other.startsWith(shadowed))
      .sort((a, b) => b.length - a.length)[0]!;
    expect(resolveProviderModelInfo('openai', longer)?.id).toBe(longer);
  });

  test('returns undefined for an unknown model rather than a wrong one', () => {
    expect(resolveProviderModelInfo('openai', 'definitely-not-a-real-model-xyz')).toBeUndefined();
  });

  test('returns undefined for an unknown provider instead of throwing', () => {
    expect(resolveProviderModelInfo('not-a-provider' as never, 'gpt-5.5')).toBeUndefined();
  });
});

describe('providers.json knowledgeCutoff data', () => {
  test('every declared cutoff is a non-empty string (no placeholders)', () => {
    // Guards the sparse-by-design field: entries may be absent, but an entry
    // that exists must be real. Catches "", "  ", "TBD"-style placeholders.
    const providerIds = ['openai', 'anthropic', 'google'] as const;
    for (const id of providerIds) {
      const entry = getProviderCapabilityEntry(id);
      if (!entry) continue;
      for (const model of entry.models) {
        if (model.knowledgeCutoff === undefined) continue;
        expect(model.knowledgeCutoff.trim().length).toBeGreaterThan(0);
        expect(model.knowledgeCutoff.toLowerCase()).not.toBe('tbd');
        expect(model.knowledgeCutoff.toLowerCase()).not.toBe('unknown');
      }
    }
  });

  test('every declared cutoff parses as a real "Month YYYY"', () => {
    // The value is rendered verbatim into the system prompt, so a malformed
    // entry ships a nonsense sentence to the model.
    const shape = /^(January|February|March|April|May|June|July|August|September|October|November|December) \d{4}$/;
    for (const providerId of PROVIDER_IDS) {
      const entry = getProviderCapabilityEntry(providerId);
      if (!entry?.models) continue;
      for (const model of entry.models) {
        if (model.knowledgeCutoff === undefined) continue;
        expect(model.knowledgeCutoff).toMatch(shape);
      }
    }
  });

  test('pins the sourced Anthropic cutoffs', () => {
    // Regression guard: getKnowledgeCutoff's `claude-opus-4` prefix branch
    // matched claude-opus-4-8 and returned "January 2025", and claude-sonnet-5
    // matched nothing at all. The registry now supplies these and wins.
    const expected: Record<string, string> = {
      'claude-opus-4-8': 'January 2026',
      'claude-opus-4-7': 'January 2026',
      'claude-sonnet-5': 'January 2026',
      'claude-sonnet-4-6': 'August 2025',
      'claude-haiku-4-5': 'February 2025',
    };
    for (const [id, cutoff] of Object.entries(expected)) {
      expect(resolveProviderModelInfo('anthropic', id)?.knowledgeCutoff).toBe(cutoff);
    }
  });

  test('pins the sourced OpenAI and Google cutoffs', () => {
    expect(resolveProviderModelInfo('openai', 'gpt-5.5')?.knowledgeCutoff).toBe('December 2025');
    expect(resolveProviderModelInfo('openai', 'gpt-5.4')?.knowledgeCutoff).toBe('August 2025');
    expect(resolveProviderModelInfo('google', 'gemini-3.5-flash')?.knowledgeCutoff).toBe('January 2025');
    expect(resolveProviderModelInfo('google', 'gemini-2.5-pro')?.knowledgeCutoff).toBe('January 2025');
  });

  test('leaves unsourced models absent rather than guessing', () => {
    // These had no reliable public cutoff at the time of writing. An absent
    // value correctly drops the prompt line; a guess would be worse than none.
    expect(resolveProviderModelInfo('deepseek', 'deepseek-v4-pro')?.knowledgeCutoff).toBeUndefined();
    expect(resolveProviderModelInfo('google', 'gemini-1.5-pro')?.knowledgeCutoff).toBeUndefined();
  });
});
