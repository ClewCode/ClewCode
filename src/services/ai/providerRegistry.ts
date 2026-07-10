import { AnthropicProvider } from './providers/AnthropicProvider.js';
import { ChatGPTProvider } from './providers/ChatGPTProvider.js';
import { ClewGatewayProvider } from './providers/ClewGatewayProvider.js';
import { CodeAssistProvider } from './providers/CodeAssistProvider.js';
import { CohereProvider } from './providers/CohereProvider.js';
import { GoogleProvider } from './providers/GoogleProvider.js';
import { KiloCodeProvider } from './providers/KiloCodeProvider.js';
import { OllamaProvider } from './providers/OllamaProvider.js';
import { OpenAICompatibleProvider } from './providers/OpenAICompatibleProvider.js';
import { OpenAIProvider } from './providers/OpenAIProvider.js';
import { OpenRouterProvider } from './providers/OpenRouterProvider.js';
import type { ProviderId, ProviderInterface } from './providers/ProviderInterface.js';

export type { ProviderId, ProviderInterface };

export type ToolCallingSupport = 'native' | 'json-text' | 'none';
export type ProviderStreamingSupport = 'full' | 'partial' | 'none';
export type PromptCachingSupport = 'explicit' | 'automatic' | 'none';

export interface ModelCapabilities {
  toolCalling: ToolCallingSupport;
  vision: boolean;
  /** @since 0.2.8 — whether the model accepts image (base64/URL) in user messages */
  imageIn?: boolean;
  /** @since 0.2.8 — whether the model accepts video (base64/URL) in user messages */
  videoIn?: boolean;
  streaming: ProviderStreamingSupport;
  maxContext: number | 'varies';
  maxOutput?: number | 'varies';
  reasoning: boolean;
  supportsSystemPrompt: boolean;
  free?: boolean;
  rateLimited?: boolean;
}

export interface ProviderCapabilities {
  chat: boolean;
  streaming: ProviderStreamingSupport;
  toolCalling: boolean;
  vision: boolean;
  imageIn?: boolean;
  videoIn?: boolean;
  jsonSchema: boolean;
  reasoningEffort: boolean;
  contextLength: string;
  promptCaching?: PromptCachingSupport;
}

export interface ProviderModelInfo {
  id: string;
  label?: string;
  capabilities: ModelCapabilities;
  tags?: string[];
  supportedTypes?: string[];
}

export interface ProviderRegistryEntry {
  providerId: ProviderId;
  label: string;
  envKey: string;
  defaultBaseUrl: string;
  modelsUrl?: string;
  defaultModel?: string;
  defaultModelVerified?: boolean;
  note?: string;
  isLocal?: boolean;
  capabilities: ProviderCapabilities;
  models: ProviderModelInfo[];
  provider: ProviderInterface;
}

import providersConfig from './providers.json';

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
      return new CodeAssistProvider();
    case 'cohere':
      return new CohereProvider();
    case 'openrouter':
      return new OpenRouterProvider();
    case 'kilocode':
      return new KiloCodeProvider();
    case 'ollama':
      return new OllamaProvider();
    case 'clew-gateway':
      return new ClewGatewayProvider();
    case 'custom':
      return new OpenAICompatibleProvider(entry.providerId, entry.label, entry.envKey, entry.defaultBaseUrl);
    default:
      if (entry.envKey && entry.defaultBaseUrl) {
        return new OpenAICompatibleProvider(entry.providerId, entry.label, entry.envKey, entry.defaultBaseUrl);
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

export const PROVIDER_IDS = Object.keys(PROVIDER_REGISTRY).filter(id => id !== 'clew-gateway') as ProviderId[];
export const DEFAULT_PROVIDER: ProviderId = 'openai';

/**
 * Legacy provider IDs that older configs/CLIs wrote to provider.json but that
 * were never registered in providers.json. Maps each alias to its canonical
 * registry ID so old configs keep working instead of silently falling back to
 * DEFAULT_PROVIDER.
 */
export const LEGACY_PROVIDER_ALIASES: Record<string, ProviderId> = {
  gemini: 'google',
  grok: 'xai',
};

export function isRegisteredProviderId(id: string): id is ProviderId {
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

export function getProviderModelInfo(provider: ProviderId, model: string): ProviderModelInfo | undefined {
  return PROVIDER_REGISTRY[provider]?.models.find(entry => entry.id === model);
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

export function createProviderInstance(provider: ProviderId): ProviderInterface {
  return getProviderRegistryEntry(provider).provider;
}

/**
 * Map provider ID to its prompt caching support level.
 *
 * - `"explicit"`: Provider supports `cache_control` markers (Anthropic/Bedrock/Vertex).
 * - `"automatic"`: Provider auto-caches long prompts without markers (OpenAI-compatible).
 * - `"none"`: No prompt caching support.
 */
const PROMPT_CACHING_MAP: Record<string, PromptCachingSupport> = {
  anthropic: 'explicit',
  openai: 'automatic',
  chatgpt: 'automatic',
  'chatgpt-api': 'automatic',
  openrouter: 'automatic',
  deepseek: 'automatic',
  groq: 'automatic',
  xai: 'automatic',
  mistral: 'automatic',
  together: 'automatic',
  fireworks: 'automatic',
  deepinfra: 'automatic',
  perplexity: 'automatic',
  cerebras: 'automatic',
  opencode: 'automatic',
  'opencode-go': 'automatic',
  sakana: 'automatic',
  cline: 'automatic',
  siliconflow: 'automatic',
  moonshot: 'automatic',
  zhipu: 'automatic',
  huggingface: 'automatic',
  poe: 'automatic',
  digitalocean: 'automatic',
  'clew-gateway': 'automatic',
  nvidia: 'automatic',
  opengateway: 'automatic',
  cohere: 'automatic',
  google: 'none',
  'google-assist': 'none',
  kilocode: 'none',
  ollama: 'none',
  custom: 'automatic',
};

export function getPromptCachingSupport(providerId: ProviderId): PromptCachingSupport {
  return PROMPT_CACHING_MAP[providerId] ?? 'none';
}

/**
 * Convenience check: should we send `cache_control` markers in API requests?
 */
export function shouldUseExplicitPromptCaching(providerId: ProviderId): boolean {
  return getPromptCachingSupport(providerId) === 'explicit';
}
