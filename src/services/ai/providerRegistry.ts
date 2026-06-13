import { AnthropicProvider } from './providers/AnthropicProvider.js';
import { ClewGatewayProvider } from './providers/ClewGatewayProvider.js';
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
    case 'google':
      return new GoogleProvider();
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

export const PROVIDER_IDS = Object.keys(PROVIDER_REGISTRY) as ProviderId[];
export const DEFAULT_PROVIDER: ProviderId = 'openai';

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
  cline: 'automatic',
  siliconflow: 'automatic',
  moonshot: 'automatic',
  zhipu: 'automatic',
  huggingface: 'automatic',
  poe: 'automatic',
  digitalocean: 'automatic',
  'clew-gateway': 'automatic',
  nvidia: 'automatic',
  cohere: 'automatic',
  google: 'none',
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
