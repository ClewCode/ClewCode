import { describe, expect, test } from 'bun:test';
import type { ModelUsage } from '../../entrypoints/agentSdkTypes.js';
import { formatCacheBreakdown } from './cost.js';

function usage(overrides: Partial<ModelUsage> = {}): ModelUsage {
  return {
    inputTokens: 2_000,
    outputTokens: 500,
    cacheReadInputTokens: 8_000,
    cacheCreationInputTokens: 0,
    webSearchRequests: 0,
    costUSD: 0.01,
    contextWindow: 1_000_000,
    maxOutputTokens: 128_000,
    provider: 'openai',
    cacheRequestCount: 4,
    cacheReportedRequestCount: 3,
    cacheHitRequestCount: 2,
    ...overrides,
  };
}

describe('formatCacheBreakdown', () => {
  test('shows hit rates, reporting coverage, and savings for reported providers', () => {
    const output = formatCacheBreakdown('gpt-5.5', usage());
    expect(output).toContain('cache status: hit (automatic)');
    expect(output).toContain('token hit rate: 80.0%');
    expect(output).toContain('request hit rate: 66.7%');
    expect(output).toContain('reporting coverage: 75.0%');
    expect(output).toContain('estimated cache savings: $0.0360');
  });

  test('does not turn missing telemetry into a miss', () => {
    const output = formatCacheBreakdown(
      'gpt-5.5',
      usage({
        cacheReadInputTokens: 0,
        cacheRequestCount: 1,
        cacheReportedRequestCount: 0,
        cacheHitRequestCount: 0,
      }),
    );
    expect(output).toContain('cache status: unreported (automatic)');
    expect(output).not.toContain('token hit rate');
  });
});
