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
      modelsUrl = baseUrl.replace(/\/+$/, '') + '/models';
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

    // Handle generic format with data array (fallback for other providers)
    if (parsedModels === null && 'data' in data && Array.isArray(data.data)) {
      parsedModels = data.data.map((model: any) => ({
        id: model.id || model.name,
        label: model.name || model.id || 'Unknown',
        description: model.description,
        contextWindow: model.context_length || model.context_window,
      }));
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

    return parsedModels.map(fm => {
      const staticCap = staticMap.get(fm.id);
      if (staticCap) {
        return {
          ...fm,
          contextWindow: typeof staticCap.maxContext === 'number' ? staticCap.maxContext : fm.contextWindow,
          supportsTools: staticCap.toolCalling !== 'none' && staticCap.toolCalling !== undefined,
          supportsVision: staticCap.vision ?? false,
          supportsReasoning: staticCap.reasoning ?? false,
          maxOutput: typeof staticCap.maxOutput === 'number' ? (staticCap.maxOutput as number) : fm.maxOutput,
          free: staticCap.free ?? false,
        };
      }
      return fm;
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

  // Quick check without async import
  try {
    // Providers that have modelsUrl and support /models endpoint
    // Based on provider registry analysis:
    // - anthropic, openai, gemini, openrouter, deepseek, opencode, groq, xai, mistral, kilocode, ollama have modelsUrl
    // - cline does NOT support /models endpoint (returns 404)
    // - google uses native SDK, no HTTP models endpoint
    // - openai_browser, openai_headless, copilot use session tokens, no models endpoint
    const supportedProviders: ProviderId[] = [
      'anthropic',
      'openai',
      'openrouter',
      'groq',
      'mistral',
      'xai',
      'ollama',
      'deepseek',
      'opencode',
      'opencode-go',
      'kilocode',
      'google',
      'nvidia',
      'custom',
    ];

    return supportedProviders.includes(activeProvider);
  } catch {
    return false;
  }
}
