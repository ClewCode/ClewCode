import { AnthropicProvider } from './providers/AnthropicProvider.js'
import { GoogleProvider } from './providers/GoogleProvider.js'
import { OpenAICompatibleProvider } from './providers/OpenAICompatibleProvider.js'
import { OpenAIResponsesProvider } from './providers/OpenAIResponsesProvider.js'
import { OpenAIProvider } from './providers/OpenAIProvider.js'
import { OllamaProvider } from './providers/OllamaProvider.js'
import { OpenRouterProvider } from './providers/OpenRouterProvider.js'
import { ChatGPTSessionProvider } from './providers/ChatGPTSessionProvider.js'
import { KiloCodeProvider } from './providers/KiloCodeProvider.js'
import { CopilotProvider } from './providers/CopilotProvider.js'
import type { ProviderId, ProviderInterface } from './providers/ProviderInterface.js'
export type { ProviderId, ProviderInterface }

export type ToolCallingSupport = 'native' | 'json-text' | 'none'
export type ProviderStreamingSupport = 'full' | 'partial' | 'none'

export interface ModelCapabilities {
  toolCalling: ToolCallingSupport
  vision: boolean
  streaming: ProviderStreamingSupport
  maxContext: number | 'varies'
  maxOutput?: number | 'varies'
  reasoning: boolean
  supportsSystemPrompt: boolean
  free?: boolean
  rateLimited?: boolean
}

export interface ProviderCapabilities {
  chat: boolean
  streaming: ProviderStreamingSupport
  toolCalling: boolean
  vision: boolean
  jsonSchema: boolean
  reasoningEffort: boolean
  contextLength: string
}

export interface ProviderModelInfo {
  id: string
  label?: string
  capabilities: ModelCapabilities
  tags?: string[]
  supportedTypes?: string[]
}

export interface ProviderRegistryEntry {
  providerId: ProviderId
  label: string
  envKey: string
  defaultBaseUrl: string
  modelsUrl?: string
  defaultModel?: string
  defaultModelVerified?: boolean
  note?: string
  isLocal?: boolean
  capabilities: ProviderCapabilities
  models: ProviderModelInfo[]
  provider: ProviderInterface
}

import providersConfig from './providers.json'

function createProvider(key: string, entry: any): ProviderInterface {
  switch (key) {
    case 'anthropic': return new AnthropicProvider();
    case 'openai': return new OpenAIProvider();
    case 'google': return new GoogleProvider();
    case 'copilot': return new CopilotProvider();
    case 'openrouter': return new OpenRouterProvider();
    case 'deepseek': return new OpenAIProvider();
    case 'kilocode': return new KiloCodeProvider();
    case 'chatgpt': return new ChatGPTSessionProvider();
    case 'chatgpt_plus': return new OpenAIResponsesProvider(
      entry.providerId, entry.label, entry.envKey, entry.defaultBaseUrl
    );
    case 'ollama': return new OllamaProvider();
    default:
      if (entry.envKey && entry.defaultBaseUrl) {
        return new OpenAICompatibleProvider(
          entry.providerId,
          entry.label,
          entry.envKey,
          entry.defaultBaseUrl
        );
      }
      throw new Error(`Unknown provider class for ${key}`);
  }
}

export const PROVIDER_REGISTRY: Record<ProviderId, ProviderRegistryEntry> = Object.fromEntries(
  Object.entries(providersConfig).map(([key, config]) => [
    key,
    { ...(config as any), provider: createProvider(key, config) }
  ])
) as any;

export const PROVIDER_IDS = Object.keys(PROVIDER_REGISTRY) as ProviderId[]
export const DEFAULT_PROVIDER: ProviderId = 'anthropic'

export function getProviderRegistryEntry(provider: ProviderId): ProviderRegistryEntry {
  return PROVIDER_REGISTRY[provider]
}

export function getProviderModelInfo(provider: ProviderId, model: string): ProviderModelInfo | undefined {
  return PROVIDER_REGISTRY[provider]?.models.find(entry => entry.id === model)
}

export function getProviderOptions(provider: ProviderId) {
  const providerEntry = getProviderRegistryEntry(provider)
  return {
    envKey: providerEntry.envKey,
    baseUrl: providerEntry.defaultBaseUrl,
    defaultModel: providerEntry.defaultModel,
    defaultModelVerified: providerEntry.defaultModelVerified,
    note: providerEntry.note,
    capabilities: providerEntry.capabilities,
  }
}

export function createProviderInstance(provider: ProviderId): ProviderInterface {
  return getProviderRegistryEntry(provider).provider
}
