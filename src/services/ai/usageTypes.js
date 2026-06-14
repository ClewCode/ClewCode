/**
 * Provider-agnostic usage and cost types.
 *
 * These types decouple cost calculation from provider-specific SDK types
 * (e.g. Anthropic's `BetaUsage`). Each provider adapter maps its own usage
 * shape into `ProviderUsage`, and the cost engine only depends on this file.
 */
// ── Conversion helpers ───────────────────────────────────────────────────────
/**
 * Convert an Anthropic `BetaUsage` (or duck-typed equivalent) to `ProviderUsage`.
 */
export function fromAnthropicUsage(usage) {
    return {
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cacheReadInputTokens: usage.cache_read_input_tokens ?? undefined,
        cacheCreationInputTokens: usage.cache_creation_input_tokens ?? undefined,
        webSearchRequests: usage.server_tool_use?.web_search_requests ?? undefined,
    };
}
/**
 * Convert an OpenAI usage object to `ProviderUsage`.
 * OpenAI `create()` returns `{ prompt_tokens, completion_tokens, ... }`.
 */
export function fromOpenAIUsage(usage) {
    return {
        inputTokens: usage.prompt_tokens ?? 0,
        outputTokens: usage.completion_tokens ?? 0,
        cacheReadInputTokens: usage.prompt_tokens_details?.cached_tokens ?? undefined,
    };
}
/**
 * Convert a Google Gemini usage object to `ProviderUsage`.
 * Gemini returns `{ promptTokenCount, candidatesTokenCount, ... }`.
 */
export function fromGoogleUsage(usage) {
    return {
        inputTokens: usage.promptTokenCount ?? 0,
        outputTokens: usage.candidatesTokenCount ?? 0,
        cacheReadInputTokens: usage.cachedContentTokenCount ?? undefined,
    };
}
/**
 * Convert a generic usage bag (loose keys, e.g. OpenRouter, Ollama) to
 * `ProviderUsage`. Handles both snake_case and camelCase.
 */
export function fromGenericUsage(usage) {
    const get = (keys) => {
        for (const k of keys) {
            const v = usage[k];
            if (typeof v === 'number' && !Number.isNaN(v))
                return v;
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
/**
 * Calculate USD cost from a unified `ProviderUsage` and `ModelCostRates`.
 */
export function calculateUsageCost(usage, rates) {
    if (rates.isFree)
        return 0;
    return ((usage.inputTokens / 1_000_000) * rates.inputTokens +
        (usage.outputTokens / 1_000_000) * rates.outputTokens +
        ((usage.cacheReadInputTokens ?? 0) / 1_000_000) * rates.promptCacheReadTokens +
        ((usage.cacheCreationInputTokens ?? 0) / 1_000_000) * rates.promptCacheWriteTokens +
        (usage.webSearchRequests ?? 0) * rates.webSearchRequests);
}
