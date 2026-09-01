import { describe, expect, test } from 'bun:test';
import { calculateCacheMetrics } from './cacheMetrics.js';

const base = {
  inputTokens: 1_000,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
  requestCount: 1,
  reportedRequestCount: 0,
  hitRequestCount: 0,
};

describe('calculateCacheMetrics', () => {
  test('distinguishes unsupported, unreported, and a reported miss', () => {
    expect(calculateCacheMetrics({ ...base, support: 'none' }).status).toBe('unsupported');
    expect(calculateCacheMetrics({ ...base, support: 'automatic' }).status).toBe('unreported');
    expect(calculateCacheMetrics({ ...base, support: 'automatic', reportedRequestCount: 1 }).status).toBe('miss');
  });

  test('calculates token hit rate, reporting coverage, and estimated savings', () => {
    const result = calculateCacheMetrics({
      ...base,
      support: 'automatic',
      inputTokens: 2_000,
      cacheReadInputTokens: 8_000,
      requestCount: 4,
      reportedRequestCount: 3,
      hitRequestCount: 2,
      rates: {
        inputTokens: 5,
        outputTokens: 30,
        promptCacheWriteTokens: 6.25,
        promptCacheReadTokens: 0.5,
        webSearchRequests: 0,
      },
    });

    expect(result.status).toBe('hit');
    expect(result.hitRate).toBe(0.8);
    expect(result.requestHitRate).toBeCloseTo(2 / 3);
    expect(result.reportingCoverage).toBe(0.75);
    expect(result.estimatedSavingsUSD).toBeCloseTo(0.036);
  });

  test('trusts observed cache data even when the static capability is stale', () => {
    expect(
      calculateCacheMetrics({
        ...base,
        support: 'none',
        cacheReadInputTokens: 500,
        reportedRequestCount: 1,
        hitRequestCount: 1,
      }).status,
    ).toBe('hit');
  });
});
