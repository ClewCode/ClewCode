import { ProviderManager } from '../../services/ai/ProviderManager.js';
import type { ProviderId } from '../../services/ai/providers/ProviderInterface.js';

export interface FetchedModel {
  id: string;
  label: string;
  description?: string;
  contextWindow?: number;
  /** Whether model supports tool/function calling */
  supportsTools?: boolean;
  /** Whether model supports vision/image input */
  supportsVision?: boolean;
  /** Whether model supports reasoning/thinking */
  supportsReasoning?: boolean;
  /** Maximum output tokens */
  maxOutput?: number;
  /** Whether model is free-tier */
  free?: boolean;
}

// OpenAI-compatible /models response format
interface OpenAIModelsResponse {
  object: 'list';
  data: Array<{
    id: string;
    object: 'model';
    created?: number;
    owned_by?: string;
  }>;
}

// OpenRouter /models response format
interface OpenRouterModel {
  id: string;
  name?: string;
  description?: string;
  context_length?: number;
  pricing?: {
    prompt?: number;
    completion?: number;
  };
}

interface OpenRouterModelsResponse {
  data: OpenRouterModel[];
}

/**
 * Fetch available models from the provider's /models endpoint
 */
export async function fetchProviderModels(provider?: ProviderId): Promise<FetchedModel[] | null> {
  const providerManager = ProviderManager.getInstance();
  const activeProvider = provider ?? providerManager.getActiveProviderName();

  // Get the models URL from provider registry
  const { PROVIDER_REGISTRY } = await import('../../services/ai/providerRegistry.js');
  const registryEntry = PROVIDER_REGISTRY[activeProvider];

  let modelsUrl: string | undefined;

  if ('modelsUrl' in registryEntry && registryEntry.modelsUrl) {
    modelsUrl = registryEntry.modelsUrl;
  } else {
    // For providers without a fixed modelsUrl (e.g. custom), derive from baseUrl
    const baseUrl = providerManager.getBaseUrlForProvider(activeProvider);
    if (baseUrl) {
      modelsUrl = `${baseUrl.replace(/\/+$/, '')}/models`;
    }
  }

  if (!modelsUrl) {
    console.log(`[fetchProviderModels] No modelsUrl for provider: ${activeProvider}`);
    return null;
  }

  const apiKey = providerManager.getApiKeyForProvider(activeProvider);
  if (!apiKey) {
    console.log(`[fetchProviderModels] No API key for provider: ${activeProvider}`);
    return null;
  }

  try {
    console.log(`[fetchProviderModels] Fetching from: ${modelsUrl}`);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };

    if (activeProvider === 'google') {
      headers['x-goog-api-key'] = apiKey;
    }

    const response = await fetch(modelsUrl, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      console.error(`[fetchProviderModels] HTTP error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = (await response.json()) as OpenAIModelsResponse | OpenRouterModelsResponse | { data?: unknown };

    // Parse raw models from API response into a common format
    let parsedModels: FetchedModel[] | null = null;

    // Handle OpenAI-compatible format (OpenAI, DeepSeek, Groq, etc.)
    if ('object' in data && data.object === 'list' && Array.isArray(data.data)) {
      parsedModels = data.data.map(model => ({
        id: model.id,
        label: model.id,
        description: model.owned_by ? `Owned by: ${model.owned_by}` : undefined,
      }));
    }

    // Handle OpenRouter format (has architecture field and uses provider/model format)
    if (
      parsedModels === null &&
      'data' in data &&
      Array.isArray(data.data) &&
      data.data.length > 0 &&
      'architecture' in data.data[0]
    ) {
      parsedModels = data.data
        .map((model: OpenRouterModel) => ({
          id: model.id,
          label: model.name ?? model.id,
          description: model.description,
          contextWindow: model.context_length,
        }))
        .filter(model => {
          // Filter out models that don't have the provider/model format
          return model.id.includes('/');
        });
    }

    // Handle generic format with data array (fallback for other providers like KiloCode/OpenCode)
    if (parsedModels === null && 'data' in data && Array.isArray(data.data)) {
      parsedModels = data.data.map((model: any) => {
        const supportedParams: string[] = Array.isArray(model.supported_parameters) ? model.supported_parameters : [];
        const inputModalities: string[] = Array.isArray(model.architecture?.input_modalities)
          ? model.architecture.input_modalities
          : [];
        return {
          id: model.id || model.name,
          label: model.name || model.id || 'Unknown',
          description: model.description,
          contextWindow: model.top_provider?.context_length || model.context_length || model.context_window,
          supportsTools: supportedParams.includes('tools'),
          supportsVision: inputModalities.includes('image'),
          supportsReasoning: supportedParams.includes('reasoning') || supportedParams.includes('include_reasoning'),
          maxOutput: model.top_provider?.max_completion_tokens || model.max_output_tokens,
          free: model.isFree ?? false,
        };
      });
    }

    if (!parsedModels) {
      console.error('[fetchProviderModels] Unknown response format:', data);
      return null;
    }

    // Merge static capability data from providers.json into fetched models
    const staticModels = registryEntry?.models ?? [];
    const staticMap = new Map<string, (typeof staticModels)[0]['capabilities']>();
    for (const m of staticModels) {
      staticMap.set(m.id, m.capabilities);
    }

    function lookupStaticCap(fmId: string) {
      // Exact match
      if (staticMap.has(fmId)) return staticMap.get(fmId);
      // Try stripping provider/ prefix (API often returns "kilo/model" but json has "model")
      const slashIdx = fmId.indexOf('/');
      if (slashIdx > 0 && slashIdx < fmId.length - 1) {
        const withoutPrefix = fmId.slice(slashIdx + 1);
        if (staticMap.has(withoutPrefix)) return staticMap.get(withoutPrefix);
      }
      // Try substring match (api returns "openai/gpt-5.5", json has "gpt-5.5")
      for (const [key, cap] of staticMap) {
        if (fmId.includes(key) || key.includes(fmId)) return cap;
      }
      return undefined;
    }

    return parsedModels.map(fm => {
      const staticCap = lookupStaticCap(fm.id);
      if (!staticCap) return fm;
      // API data takes priority; static only fills gaps
      return {
        ...fm,
        contextWindow:
          fm.contextWindow ?? (typeof staticCap.maxContext === 'number' ? staticCap.maxContext : undefined),
        supportsTools: fm.supportsTools ?? (staticCap.toolCalling !== 'none' && staticCap.toolCalling !== undefined),
        supportsVision: fm.supportsVision ?? staticCap.vision ?? false,
        supportsReasoning: fm.supportsReasoning ?? staticCap.reasoning ?? false,
        maxOutput:
          fm.maxOutput ?? (typeof staticCap.maxOutput === 'number' ? (staticCap.maxOutput as number) : undefined),
        free: fm.free ?? staticCap.free ?? false,
      };
    });
  } catch (error) {
    console.error('[fetchProviderModels] Error fetching models:', error);
    return null;
  }
}

/**
 * Check if the provider supports fetching models
 */
export function supportsModelFetching(provider?: ProviderId): boolean {
  const providerManager = ProviderManager.getInstance();
  const activeProvider = provider ?? providerManager.getActiveProviderName();

  // google-assist uses OAuth-only (no HTTP models endpoint)
  if (activeProvider === 'google-assist') return false;

  // All other providers try the API endpoint.
  // If the call fails, the caller already falls back to
  // the static model list from providers.json.
  return true;
}
