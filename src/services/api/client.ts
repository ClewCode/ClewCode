/**
 * Provider client factory.
 *
 * Returns the right SDK client (Anthropic, OpenAI, Google, …) and wraps
 * non-Anthropic clients in `AnthropicAdapter` so the rest of the codebase
 * can use the unified `client.beta.messages.*` interface.
 */

import type { ClientOptions } from '@anthropic-ai/sdk';
import { AnthropicAdapter } from '../ai/adapter/AnthropicAdapter.js';
import { ProviderManager } from '../ai/ProviderManager.js';
import type { ProviderId } from '../ai/providers/ProviderInterface.js';
import { createAnthropicClient } from './anthropicClient.js';

// ── Unified client interface ─────────────────────────────────────────────────

/**
 * The unified client shape that every provider exposes.
 *
 * The request/response types flowing through `beta.messages.create()` are
 * the Clew Internal Protocol v1 — the Anthropic Messages format, declared in
 * `clewProtocol.ts`.
 *
 * - Anthropic SDK clients already satisfy this natively.
 * - Non-Anthropic clients are wrapped in `AnthropicAdapter` which provides
 *   the same `beta.messages.create()` shape.
 */
export interface UnifiedAIProviderClient {
  beta: {
    messages: {
      create(params: any, options?: any): Promise<any> & { withResponse?: () => Promise<any> };
    };
  };
}

// ── Factory functions ────────────────────────────────────────────────────────

export async function getAnthropicClient({
  apiKey,
  maxRetries,
  model,
  fetchOverride,
  source,
}: {
  apiKey?: string;
  maxRetries: number;
  model?: string;
  fetchOverride?: ClientOptions['fetch'];
  source?: string;
}): Promise<Awaited<ReturnType<typeof createAnthropicClient>>> {
  return createAnthropicClient({ apiKey, maxRetries, model, fetchOverride, source });
}

/**
 * Returns a unified provider client for any registered provider.
 *
 * - For `anthropic`: returns the native Anthropic SDK client directly.
 * - For all others: creates the provider-specific SDK client and wraps it
 *   in `AnthropicAdapter` (which uses the adapter registry under the hood).
 */
export async function getAIProviderClient({
  provider,
  apiKey,
  maxRetries,
  model,
  fetchOverride,
  source,
}: {
  provider?: ProviderId;
  apiKey?: string;
  maxRetries: number;
  model?: string;
  fetchOverride?: ClientOptions['fetch'];
  source?: string;
}): Promise<UnifiedAIProviderClient> {
  const providerManager = ProviderManager.getInstance();
  const effectiveProvider = provider ?? providerManager.getActiveProviderName();

  // Anthropic: return native client directly (no adapter needed).
  // Resolve the key through ProviderManager first so a key stored in
  // provider.json (apiKeys.anthropic) works like it does for every other
  // provider; createAnthropicClient still falls back to its own auth chain
  // (env, keychain, apiKeyHelper, OAuth) when this resolves to undefined.
  if (effectiveProvider === 'anthropic') {
    const resolvedApiKey = apiKey ?? providerManager.getApiKeyForProvider('anthropic');
    return getAnthropicClient({ apiKey: resolvedApiKey, maxRetries, model, fetchOverride, source });
  }

  // Other providers: create SDK client and wrap with adapter
  const rawClient = await providerManager.createClient(effectiveProvider, {
    apiKey,
    model,
    fetchOverride,
    source,
    maxRetries,
  });

  return new AnthropicAdapter(rawClient, effectiveProvider) as unknown as UnifiedAIProviderClient;
}

export const CLIENT_REQUEST_ID_HEADER = 'x-client-request-id';
export const AGENT_ID_HEADER = 'x-claude-code-agent-id';
export const PARENT_AGENT_ID_HEADER = 'x-claude-code-parent-agent-id';
