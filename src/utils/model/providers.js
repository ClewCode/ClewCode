import { ProviderManager } from '../../services/ai/ProviderManager.js';
/**
 * Returns the Anthropic deployment type. For non-Anthropic providers,
 * returns 'firstParty' as the safest default (matches legacy behavior).
 */
export function getAPIProvider() {
    return ProviderManager.getInstance().getAnthropicProviderType();
}
export function getAPIProviderForStatsig() {
    return getAPIProvider();
}
export function isFirstPartyAnthropicBaseUrl() {
    return ProviderManager.getInstance().isFirstPartyAnthropicBaseUrl();
}
/**
 * Returns the active provider ID (anthropic, openai, google, deepseek, etc.).
 * Use this to check which provider is active for multi-provider routing.
 *
 * @example
 *   const provider = getActiveProviderId()
 *   if (provider === 'anthropic') { ... Anthropic-specific logic ... }
 *   if (provider === 'openai')   { ... OpenAI-specific logic ... }
 */
export function getActiveProviderId() {
    return ProviderManager.getInstance().getActiveProviderName();
}
/**
 * Returns true if the active provider is Anthropic (any deployment type:
 * firstParty, bedrock, vertex, or foundry). Use to gate Anthropic-only
 * features (beta headers, thinking blocks, web_search_20250305, etc.).
 */
export function isAnthropicProvider() {
    const provider = getActiveProviderId();
    return provider === 'anthropic';
}
