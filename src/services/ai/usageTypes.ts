/**
 * Provider-agnostic usage and cost types.
 *
 * These types decouple cost calculation from provider-specific SDK types
 * (e.g. Anthropic's `BetaUsage`). Each provider adapter maps its own usage
 * shape into `ProviderUsage`, and the cost engine only depends on this file.
 */

// ── Unified usage type ───────────────────────────────────────────────────────

/** Provider-agnostic token usage report. */
export interface ProviderUsage {
  /** Tokens sent in the request prompt. */
  inputTokens: number;
  /** Tokens generated in the response. */
  outputTokens: number;
  /** Tokens read from a prompt-cache hit (0 if caching is unsupported / unused). */
  cacheReadInputTokens?: number;
  /** Tokens written to the prompt cache (0 if caching is unsupported / unused). */
  cacheCreationInputTokens?: number;
  /** Number of web-search requests made server-side (0 if unsupported). */
  webSearchRequests?: number;
  /** Opaque provider-internal fields (billing tier, inference region, etc.). */
  providerMetadata?: Record<string, unknown>;
}

// ── Conversion helpers ───────────────────────────────────────────────────────

/**
 * Convert a generic usage bag (loose keys, e.g. OpenRouter, Ollama) to
 * `ProviderUsage`. Handles both snake_case and camelCase.
 */
export function fromGenericUsage(usage: Record<string, unknown>): ProviderUsage {
  const get = (keys: string[]): number | undefined => {
    for (const k of keys) {
      const v = usage[k];
      if (typeof v === 'number' && !Number.isNaN(v)) return v;
    }
    return undefined;
  };
  return {
    inputTokens: get(['input_tokens', 'inputTokens', 'prompt_tokens', 'promptTokenCount']) ?? 0,
    outputTokens: get(['output_tokens', 'outputTokens', 'completion_tokens', 'candidatesTokenCount']) ?? 0,
    cacheReadInputTokens: get(['cache_read_input_tokens', 'cacheReadInputTokens', 'cachedContentTokenCount']),
    cacheCreationInputTokens: get(['cache_creation_input_tokens', 'cacheCreationInputTokens']),
  };
}

// ── Cost calculation ─────────────────────────────────────────────────────────

export interface ModelCostRates {
  /** $ per 1M input tokens. */
  inputTokens: number;
  /** $ per 1M output tokens. */
  outputTokens: number;
  /** $ per 1M prompt-cache-write tokens. */
  promptCacheWriteTokens: number;
  /** $ per 1M prompt-cache-read tokens. */
  promptCacheReadTokens: number;
  /** $ per web-search request. */
  webSearchRequests: number;
  /** If true the model is free (cost is always $0). */
  isFree?: boolean;
}

/**
 * Calculate USD cost from a unified `ProviderUsage` and `ModelCostRates`.
 */
export function calculateUsageCost(usage: ProviderUsage, rates: ModelCostRates): number {
  if (rates.isFree) return 0;
  return (
    (usage.inputTokens / 1_000_000) * rates.inputTokens +
    (usage.outputTokens / 1_000_000) * rates.outputTokens +
    ((usage.cacheReadInputTokens ?? 0) / 1_000_000) * rates.promptCacheReadTokens +
    ((usage.cacheCreationInputTokens ?? 0) / 1_000_000) * rates.promptCacheWriteTokens +
    (usage.webSearchRequests ?? 0) * rates.webSearchRequests
  );
}
