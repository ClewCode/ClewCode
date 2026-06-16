import { ProviderManager } from './ProviderManager.js';
import { getProviderRegistryEntry, PROVIDER_IDS, type ProviderModelInfo } from './providerRegistry.js';
import type { ProviderId } from './providers/ProviderInterface.js';

type RemoteModelPayload = {
  id?: string;
  name?: string;
  supported_parameters?: string[];
  capabilities?: { tools?: boolean; tool_calling?: boolean };
  max_input_tokens?: number;
  max_output_tokens?: number;
  context_window?: number;
  contextWindow?: number;
};

const MODELS_CACHE = new Map<ProviderId, { data: ProviderModelInfo[]; timestamp: number }>();
const MODELS_CACHE_TTL_MS = 5 * 60 * 1000;

export function clearProviderModelsCache(provider?: ProviderId): void {
  if (provider) {
    MODELS_CACHE.delete(provider);
    return;
  }

  MODELS_CACHE.clear();
}

export async function fetchProviderModels(provider: ProviderId): Promise<ProviderModelInfo[]> {
  const cached = MODELS_CACHE.get(provider);
  if (cached && Date.now() - cached.timestamp < MODELS_CACHE_TTL_MS) {
    return cached.data;
  }

  const providerManager = ProviderManager.getInstance();

  try {
    const remoteModels = await providerManager.listModels(provider);

    if (remoteModels.length > 0) {
      const models = remoteModels
        .map(model => toProviderModelInfo(provider, model))
        .filter((model): model is ProviderModelInfo => Boolean(model));

      if (models.length > 0) {
        return cacheAndReturn(provider, models);
      }
    }
  } catch (error) {
    // Fall back to registry models below.
  }

  return cacheAndReturn(provider, getFallbackModels(provider));
}

function cacheAndReturn(provider: ProviderId, data: ProviderModelInfo[]): ProviderModelInfo[] {
  MODELS_CACHE.set(provider, { data, timestamp: Date.now() });
  return data;
}

function getFallbackModels(provider: ProviderId): ProviderModelInfo[] {
  const info = getProviderRegistryEntry(provider);
  if (info.models.length > 0) {
    return info.models;
  }

  if (!info.defaultModel) {
    return [];
  }

  return [
    {
      id: info.defaultModel,
      label: info.defaultModel,
      capabilities: {
        toolCalling: info.capabilities.toolCalling ? 'native' : 'none',
        vision: info.capabilities.vision,
        streaming: info.capabilities.streaming,
        maxContext:
          typeof info.capabilities.contextLength === 'string'
            ? info.capabilities.contextLength === '1M'
              ? 1_000_000
              : 200_000
            : 200_000,
        maxOutput: 'varies',
        reasoning: info.capabilities.reasoningEffort,
        supportsSystemPrompt: true,
      },
      tags: ['default'],
    },
  ];
}

function toProviderModelInfo(provider: ProviderId, model: RemoteModelPayload): ProviderModelInfo | null {
  const id = model.id ?? model.name;
  if (!id) {
    return null;
  }

  const info = getProviderRegistryEntry(provider);

  // Try to get context window from API response, fall back to providers.json
  const apiMaxContext = model.max_input_tokens ?? model.context_window ?? model.contextWindow;
  const registryModel = info.models.find(
    m => m.id.toLowerCase() === id.toLowerCase() || id.toLowerCase().includes(m.id.toLowerCase()),
  );
  const registryMaxContext =
    registryModel?.capabilities?.maxContext !== undefined && registryModel.capabilities.maxContext !== 'varies'
      ? registryModel.capabilities.maxContext
      : undefined;
  // If not found in current provider's registry, search across all providers
  // by model id. This catches providers (e.g. OpenCode) whose registry lists
  // only a subset of available models, while others like deepseek have the
  // same model with context window info.
  const crossProviderMaxContext =
    registryMaxContext ??
    (() => {
      const lowerId = id.toLowerCase();
      for (const pid of PROVIDER_IDS) {
        if (pid === provider) continue;
        const entry = getProviderRegistryEntry(pid);
        const m = entry.models.find(
          mm => mm.id.toLowerCase() === lowerId || lowerId.includes(mm.id.toLowerCase()),
        );
        if (m?.capabilities?.maxContext && typeof m.capabilities.maxContext === 'number' && m.capabilities.maxContext !== 'varies')
          return m.capabilities.maxContext;
      }
      return undefined;
    })();
  const maxContext = (typeof apiMaxContext === 'number' ? apiMaxContext : crossProviderMaxContext) ?? 'varies';

  const apiMaxOutput = model.max_output_tokens;
  const registryMaxOutput =
    registryModel?.capabilities?.maxOutput !== undefined && registryModel.capabilities.maxOutput !== 'varies'
      ? registryModel.capabilities.maxOutput
      : undefined;
  // Cross-provider fallback for maxOutput (same model may exist in other providers)
  const crossProviderMaxOutput =
    registryMaxOutput ??
    (() => {
      const lowerId = id.toLowerCase();
      for (const pid of PROVIDER_IDS) {
        if (pid === provider) continue;
        const entry = getProviderRegistryEntry(pid);
        const m = entry.models.find(
          mm => mm.id.toLowerCase() === lowerId || lowerId.includes(mm.id.toLowerCase()),
        );
        if (m?.capabilities?.maxOutput && typeof m.capabilities.maxOutput === 'number' && m.capabilities.maxOutput !== 'varies')
          return m.capabilities.maxOutput;
      }
      return undefined;
    })();
  const maxOutput = (typeof apiMaxOutput === 'number' ? apiMaxOutput : crossProviderMaxOutput) ?? 'varies';

  const toolCalling = modelSupportsToolCalling(provider, id, model);

  return {
    id,
    label: model.name && model.name !== id ? model.name : id,
    capabilities: {
      toolCalling: toolCalling ? 'native' : 'none',
      vision: info.capabilities.vision,
      imageIn: info.capabilities.imageIn ?? info.capabilities.vision,
      videoIn: info.capabilities.videoIn ?? false,
      streaming: info.capabilities.streaming,
      maxContext,
      maxOutput,
      reasoning: info.capabilities.reasoningEffort,
      supportsSystemPrompt: true,
    },
    tags: buildTags(toolCalling, model),
  };
}

function buildTags(toolCalling: boolean, model: RemoteModelPayload): string[] | undefined {
  const tags: string[] = [];
  if (toolCalling) {
    tags.push('tools');
  }
  if (model.name && model.id && model.name !== model.id) {
    tags.push('api');
  }
  return tags.length > 0 ? tags : undefined;
}

function modelSupportsToolCalling(provider: ProviderId, model: string, metadata?: RemoteModelPayload): boolean {
  const normalized = model.toLowerCase();
  if (provider === 'kilocode' && normalized === 'tencent/hy3-preview:free') {
    return false;
  }

  if (provider === 'anthropic') {
    return true;
  }

  const params = metadata?.supported_parameters;
  if (Array.isArray(params)) {
    return params.includes('tools') || params.includes('tool_choice');
  }

  if (metadata?.capabilities) {
    return Boolean(metadata.capabilities.tools || metadata.capabilities.tool_calling);
  }

  return getProviderRegistryEntry(provider).capabilities.toolCalling;
}
