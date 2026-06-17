import { ClewGatewayProvider } from './providers/ClewGatewayProvider.js';
import { CodeAssistProvider } from './providers/CodeAssistProvider.js';
import { CohereProvider } from './providers/CohereProvider.js';
import { GoogleProvider } from './providers/GoogleProvider.js';
import { KiloCodeProvider } from './providers/KiloCodeProvider.js';
import { OllamaProvider } from './providers/OllamaProvider.js';
import { OpenAICompatibleProvider } from './providers/OpenAICompatibleProvider.js';
import { OpenAIProvider } from './providers/OpenAIProvider.js';
import { OpenRouterProvider } from './providers/OpenRouterProvider.js';
import providersConfig from './providers.json';

function createProvider(key, entry) {
  switch (key) {
    case 'openai':
      return new OpenAIProvider();
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
export const PROVIDER_REGISTRY = Object.fromEntries(
  Object.entries(providersConfig).map(([key, config]) => [key, { ...config, provider: createProvider(key, config) }]),
);
export const PROVIDER_IDS = Object.keys(PROVIDER_REGISTRY).filter(id => id !== 'clew-gateway');
export const DEFAULT_PROVIDER = 'openai';
export function getProviderRegistryEntry(provider) {
  return PROVIDER_REGISTRY[provider];
}
export function getProviderModelInfo(provider, model) {
  return PROVIDER_REGISTRY[provider]?.models.find(entry => entry.id === model);
}
export function getProviderOptions(provider) {
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
export function createProviderInstance(provider) {
  return getProviderRegistryEntry(provider).provider;
}
/**
 * Map provider ID to its prompt caching support level.
 *
 * - `"explicit"`: Provider supports `cache_control` markers (Anthropic/Bedrock/Vertex).
 * - `"automatic"`: Provider auto-caches long prompts without markers (OpenAI-compatible).
 * - `"none"`: No prompt caching support.
 */
const PROMPT_CACHING_MAP = {
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
  'google-assist': 'none',
  kilocode: 'none',
  ollama: 'none',
  custom: 'automatic',
};
export function getPromptCachingSupport(providerId) {
  return PROMPT_CACHING_MAP[providerId] ?? 'none';
}
/**
 * Convenience check: should we send `cache_control` markers in API requests?
 */
export function shouldUseExplicitPromptCaching(providerId) {
  return getPromptCachingSupport(providerId) === 'explicit';
}
