import { AnthropicProvider } from './providers/AnthropicProvider.js';
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
    case 'anthropic':
      return new AnthropicProvider();
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
/**
 * Legacy provider IDs that older configs/CLIs wrote to provider.json but that
 * were never registered in providers.json. Maps each alias to its canonical
 * registry ID so old configs keep working instead of silently falling back to
 * DEFAULT_PROVIDER.
 */
export const LEGACY_PROVIDER_ALIASES = {
  gemini: 'google',
};
export function isRegisteredProviderId(id) {
  return Boolean(PROVIDER_REGISTRY[id]);
}
/**
 * Resolve a raw provider string (from provider.json, AI_PROVIDER, or CLI args)
 * to a registered ProviderId. Applies legacy aliases (e.g. gemini -> google).
 * Returns undefined when the value doesn't resolve to a registered provider.
 */
export function normalizeProviderId(id) {
  if (!id) return undefined;
  const lower = id.toLowerCase().trim();
  const resolved = LEGACY_PROVIDER_ALIASES[lower] ?? lower;
  return isRegisteredProviderId(resolved) ? resolved : undefined;
}
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
