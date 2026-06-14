/**
 * Provider client factory.
 *
 * Returns the right SDK client (Anthropic, OpenAI, Google, …) and wraps
 * non-Anthropic clients in `AnthropicAdapter` so the rest of the codebase
 * can use the unified `client.beta.messages.*` interface.
 */
import { AnthropicAdapter } from '../ai/adapter/AnthropicAdapter.js';
import { ProviderManager } from '../ai/ProviderManager.js';
import { createAnthropicClient } from './anthropicClient.js';
// ── Factory functions ────────────────────────────────────────────────────────
export async function getAnthropicClient({ apiKey, maxRetries, model, fetchOverride, source, }) {
    return createAnthropicClient({ apiKey, maxRetries, model, fetchOverride, source });
}
/**
 * Returns a unified provider client for any registered provider.
 *
 * - For `anthropic`: returns the native Anthropic SDK client directly.
 * - For all others: creates the provider-specific SDK client and wraps it
 *   in `AnthropicAdapter` (which uses the adapter registry under the hood).
 */
export async function getAIProviderClient({ provider, apiKey, maxRetries, model, fetchOverride, source, }) {
    const providerManager = ProviderManager.getInstance();
    const effectiveProvider = provider ?? providerManager.getActiveProviderName();
    // Anthropic: return native client directly (no adapter needed)
    if (effectiveProvider === 'anthropic') {
        return getAnthropicClient({ apiKey, maxRetries, model, fetchOverride, source });
    }
    // Other providers: create SDK client and wrap with adapter
    const rawClient = await providerManager.createClient(effectiveProvider, {
        apiKey,
        model,
        fetchOverride,
        source,
        maxRetries,
    });
    return new AnthropicAdapter(rawClient, effectiveProvider);
}
export const CLIENT_REQUEST_ID_HEADER = 'x-client-request-id';
export const AGENT_ID_HEADER = 'x-claude-code-agent-id';
export const PARENT_AGENT_ID_HEADER = 'x-claude-code-parent-agent-id';
