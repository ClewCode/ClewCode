import { describe, expect, test } from 'bun:test';
import { normalizeUsage } from './usageNormalizer.js';

describe('normalizeUsage', () => {
  test('parses numeric token counts', () => {
    const usage = normalizeUsage({ usage: { prompt_tokens: 10, completion_tokens: 5 } });
    expect(usage.inputTokens).toBe(10);
    expect(usage.outputTokens).toBe(5);
    expect(usage.totalTokens).toBe(15);
  });

  test('parses string token counts from providers that return strings', () => {
    const usage = normalizeUsage({ usage: { prompt_tokens: '123', completion_tokens: '45' } });
    expect(usage.inputTokens).toBe(123);
    expect(usage.outputTokens).toBe(45);
    expect(usage.totalTokens).toBe(168);
  });

  test('rejects non-numeric strings', () => {
    const usage = normalizeUsage({ usage: { prompt_tokens: '12a', completion_tokens: 'abc' } });
    expect(usage.inputTokens).toBe(0);
    expect(usage.outputTokens).toBe(0);
  });

  test('normalizes OpenAI cached tokens into mutually exclusive buckets', () => {
    expect(
      normalizeUsage({
        usage: {
          prompt_tokens: 10_000,
          completion_tokens: 500,
          prompt_tokens_details: { cached_tokens: 8_000 },
        },
      }),
    ).toMatchObject({
      inputTokens: 2_000,
      outputTokens: 500,
      cacheReadInputTokens: 8_000,
      totalTokens: 10_500,
    });
  });

  test('preserves an explicitly reported zero cache read as a real miss', () => {
    const usage = normalizeUsage({
      usage: { prompt_tokens: 1_000, prompt_tokens_details: { cached_tokens: 0 } },
    });
    expect(usage.cacheReadInputTokens).toBe(0);
    expect('cacheReadInputTokens' in usage).toBe(true);
  });

  test('normalizes DeepSeek hit and miss tokens', () => {
    expect(
      normalizeUsage({
        usage: { prompt_tokens: 10_000, prompt_cache_hit_tokens: 7_500, prompt_cache_miss_tokens: 2_500 },
      }),
    ).toMatchObject({ inputTokens: 2_500, cacheReadInputTokens: 7_500, totalTokens: 10_000 });
  });

  test('normalizes Gemini cached content tokens', () => {
    expect(
      normalizeUsage({
        usage: { promptTokenCount: 5_000, candidatesTokenCount: 200, cachedContentTokenCount: 4_000 },
      }),
    ).toMatchObject({ inputTokens: 1_000, outputTokens: 200, cacheReadInputTokens: 4_000, totalTokens: 5_200 });
  });
});
