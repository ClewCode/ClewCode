import { AnthropicProvider } from './providers/AnthropicProvider.js';
import { ChatGPTProvider } from './providers/ChatGPTProvider.js';
import { AntigravityProvider } from './providers/CodeAssistProvider.js';
import { CohereProvider } from './providers/CohereProvider.js';
import { GoogleProvider } from './providers/GoogleProvider.js';
import { KiloCodeProvider } from './providers/KiloCodeProvider.js';
import { OllamaProvider } from './providers/OllamaProvider.js';
import { OpenAICompatibleProvider } from './providers/OpenAICompatibleProvider.js';
import { OpenAIProvider } from './providers/OpenAIProvider.js';
import { OpenRouterProvider } from './providers/OpenRouterProvider.js';
import type { ProviderId, ProviderInterface } from './providers/ProviderInterface.js';

// Capability shapes and lookups live in providerCapabilities.ts, which has no
// runtime imports — importing them from here would drag in every provider
// class and close an import cycle. Re-exported so this module's public API is
// unchanged.
export type {
  ModelCapabilities,
  PromptCachingSupport,
  ProviderCapabilities,
  ProviderCapabilityEntry,
  ProviderModelInfo,
  ProviderStreamingSupport,
  ToolCallingSupport,
} from './providerCapabilities.js';
export { getPromptCachingSupport, getProviderModelInfo } from './providerCapabilities.js';
export type { ProviderId, ProviderInterface };

import { getPromptCachingSupport, type ProviderCapabilityEntry } from './providerCapabilities.js';

export interface ProviderRegistryEntry extends ProviderCapabilityEntry {
  provider: ProviderInterface;
}

import providersConfig from './providers.json';

export { providersConfig };

function createProvider(key: string, entry: any): ProviderInterface {
  switch (key) {
    case 'anthropic':
      return new AnthropicProvider();
    case 'openai':
      return new OpenAIProvider();
    case 'chatgpt':
      return new ChatGPTProvider();
    case 'google':
      return new GoogleProvider();
    case 'google-assist':
      return new AntigravityProvider();
    case 'cohere':
      return new CohereProvider();
    case 'openrouter':
      return new OpenRouterProvider();
    case 'kilocode':
      return new KiloCodeProvider();
    case 'ollama':
      return new OllamaProvider();
    case 'custom':
      return new OpenAICompatibleProvider(entry.providerId, entry.label, entry.envKey, entry.defaultBaseUrl);
    default:
      if (entry.envKey && entry.defaultBaseUrl) {
        return new OpenAICompatibleProvider(entry.providerId, entry.label, entry.envKey, entry.defaultBaseUrl, true, {
          supportsVision: entry.capabilities?.imageIn !== false,
        });
      }
      throw new Error(`Unknown provider class for ${key}`);
  }
}

export const PROVIDER_REGISTRY: Record<ProviderId, ProviderRegistryEntry> = Object.fromEntries(
  Object.entries(providersConfig).map(([key, config]) => [
    key,
    { ...(config as any), provider: createProvider(key, config) },
  ]),
) as any;

export const PROVIDER_IDS = Object.keys(PROVIDER_REGISTRY) as ProviderId[];
export const DEFAULT_PROVIDER: ProviderId = 'openai';

/**
 * Legacy provider IDs that older configs/CLIs wrote to provider.json but that
 * were never registered in providers.json. Maps each alias to its canonical
 * registry ID so old configs keep working instead of silently falling back to
 * DEFAULT_PROVIDER.
 */
const LEGACY_PROVIDER_ALIASES: Record<string, ProviderId> = {
  gemini: 'google',
  grok: 'xai',
  antigravity: 'google-assist',
  'code-assist': 'google-assist',
  codeassist: 'google-assist',
};

function isRegisteredProviderId(id: string): id is ProviderId {
  return Boolean(PROVIDER_REGISTRY[id as ProviderId]);
}

/**
 * Resolve a raw provider string (from provider.json, AI_PROVIDER, or CLI args)
 * to a registered ProviderId. Applies legacy aliases (e.g. gemini -> google).
 * Returns undefined when the value doesn't resolve to a registered provider.
 */
export function normalizeProviderId(id: string | null | undefined): ProviderId | undefined {
  if (!id) return undefined;
  const lower = id.toLowerCase().trim();
  const resolved = LEGACY_PROVIDER_ALIASES[lower] ?? lower;
  return isRegisteredProviderId(resolved) ? (resolved as ProviderId) : undefined;
}

export function getProviderRegistryEntry(provider: ProviderId): ProviderRegistryEntry {
  return PROVIDER_REGISTRY[provider];
}

/**
 * A registry entry stripped of its live `provider` instance, so it can be
 * written to provider.json or held in a session-scoped config overlay.
 */
export type SerializableProviderRegistryEntry = Omit<ProviderRegistryEntry, 'provider'>;

export function getSerializableProviderRegistryEntry(provider: ProviderId): SerializableProviderRegistryEntry {
  const { provider: _instance, ...serializable } = getProviderRegistryEntry(provider);
  return serializable;
}

export function getProviderOptions(provider: ProviderId) {
  const providerEntry = getProviderRegistryEntry(provider);
  return {
    envKey: providerEntry.envKey,
    baseUrl: providerEntry.defaultBaseUrl,
    defaultModel: providerEntry.defaultModel,
    defaultModelVerified: providerEntry.defaultModelVerified,
    note: providerEntry.note,
    capabilities: providerEntry.capabilities,
  };
}

/**
 * Convenience check: should we send `cache_control` markers in API requests?
 * จัดเต็ม: ทั้ง explicit (Anthropic) และ automatic (OpenAI/OpenRouter/DeepSeek/etc.)
 * ส่ง cache_control แบบ Anthropic-style 4 จุดให้ทุก provider ที่รองรับ
 * google/none ยังไม่ส่ง
 */
export function shouldUseExplicitPromptCaching(providerId: ProviderId): boolean {
  const support = getPromptCachingSupport(providerId);
  return support === 'explicit' || support === 'automatic';
}
