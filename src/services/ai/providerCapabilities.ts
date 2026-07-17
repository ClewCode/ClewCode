/**
 * Provider capability data, read straight from providers.json.
 *
 * Deliberately separate from providerRegistry.ts: that module instantiates
 * every provider class, and each provider imports the adapter layer, so
 * anything in the adapter layer that reached for capability data through it
 * closed an import cycle (adapter -> providerRegistry -> ChatGPTProvider ->
 * adapter) and crashed with a TDZ error depending on which module loaded
 * first. Capability lookups need only data, so they live here with no
 * runtime imports beyond the JSON itself.
 */
import type { ProviderId } from './providers/ProviderInterface.js';
import providersConfig from './providers.json';

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

/** A registry entry minus the live `provider` instance. */
export interface ProviderCapabilityEntry {
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
}

const PROVIDER_CAPABILITIES = providersConfig as unknown as Record<ProviderId, ProviderCapabilityEntry>;

export function getProviderCapabilityEntry(provider: ProviderId): ProviderCapabilityEntry {
  return PROVIDER_CAPABILITIES[provider];
}

export function getProviderModelInfo(provider: ProviderId, model: string): ProviderModelInfo | undefined {
  return PROVIDER_CAPABILITIES[provider]?.models.find(entry => entry.id === model);
}
