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
  /**
   * Training-data cutoff as a human-readable string (e.g. "August 2025"),
   * surfaced to the model in the system prompt's Environment section.
   *
   * Optional and deliberately sparse: an omitted cutoff simply drops the line,
   * whereas a wrong one makes the model confidently misstate its own knowledge
   * horizon. Only populate from the provider's own documentation — never infer
   * from a release date or a version number.
   */
  knowledgeCutoff?: string;
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

/**
 * Like {@link getProviderModelInfo} but tolerant of the decorations real model
 * strings carry: casing, provider prefixes (`openai/gpt-5.5`), dated suffixes
 * (`gpt-5.5-2026-05-01`) and the client-side `[1m]` marker.
 *
 * Kept dependency-free (no getCanonicalName import) so this module stays free
 * of runtime imports and can't close an import cycle through the registry.
 * Prefers the longest id among substring matches, so `gpt-5.5` doesn't win over
 * `gpt-5.5-mini` when both are substrings of the requested model.
 */
export function resolveProviderModelInfo(provider: ProviderId, model: string): ProviderModelInfo | undefined {
  const models = PROVIDER_CAPABILITIES[provider]?.models;
  if (!models || models.length === 0) return undefined;

  const normalized = model
    .toLowerCase()
    .replace(/\[\dm\]/g, '')
    .trim();

  const exact = models.find(entry => entry.id.toLowerCase() === normalized);
  if (exact) return exact;

  let best: ProviderModelInfo | undefined;
  for (const entry of models) {
    const id = entry.id.toLowerCase();
    if (!normalized.includes(id) && !id.includes(normalized)) continue;
    if (!best || entry.id.length > best.id.length) best = entry;
  }
  return best;
}
