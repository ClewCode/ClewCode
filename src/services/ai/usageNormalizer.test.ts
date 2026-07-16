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
});
