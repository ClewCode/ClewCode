import type { PromptCachingSupport } from './providerCapabilities.js';
import type { ModelCostRates } from './usageTypes.js';

export type CacheObservationStatus = 'hit' | 'miss' | 'unsupported' | 'unreported';

export type CacheMetricInput = {
  support: PromptCachingSupport;
  inputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  requestCount: number;
  reportedRequestCount: number;
  hitRequestCount: number;
  rates?: ModelCostRates;
};

export type CacheMetrics = {
  status: CacheObservationStatus;
  hitRate: number | null;
  requestHitRate: number | null;
  reportingCoverage: number | null;
  estimatedSavingsUSD: number | null;
  cacheableInputTokens: number;
};

/** Build cache metrics without treating an absent provider field as a zero-token miss. */
export function calculateCacheMetrics(input: CacheMetricInput): CacheMetrics {
  const cacheableInputTokens = input.inputTokens + input.cacheReadInputTokens + input.cacheCreationInputTokens;
  const hasReport = input.reportedRequestCount > 0;
  const status: CacheObservationStatus = hasReport
    ? input.cacheReadInputTokens > 0
      ? 'hit'
      : 'miss'
    : input.support === 'none'
      ? 'unsupported'
      : 'unreported';
  const reportingCoverage = input.requestCount > 0 ? input.reportedRequestCount / input.requestCount : null;
  const hitRate = hasReport && cacheableInputTokens > 0 ? input.cacheReadInputTokens / cacheableInputTokens : null;
  const requestHitRate = hasReport ? input.hitRequestCount / input.reportedRequestCount : null;
  const savedPerMillion = input.rates ? Math.max(0, input.rates.inputTokens - input.rates.promptCacheReadTokens) : 0;
  const estimatedSavingsUSD =
    input.rates && input.cacheReadInputTokens > 0 ? (input.cacheReadInputTokens / 1_000_000) * savedPerMillion : null;

  return { status, hitRate, requestHitRate, reportingCoverage, estimatedSavingsUSD, cacheableInputTokens };
}
