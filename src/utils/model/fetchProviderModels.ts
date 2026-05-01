import type { ProviderId } from '../../services/ai/providers/ProviderInterface.js'
import { ProviderManager } from '../../services/ai/ProviderManager.js'

export interface FetchedModel {
  id: string
  label: string
  description?: string
  contextWindow?: number
}

// OpenAI-compatible /models response format
interface OpenAIModelsResponse {
  object: 'list'
  data: Array<{
    id: string
    object: 'model'
    created?: number
    owned_by?: string
  }>
}

// OpenRouter /models response format
interface OpenRouterModel {
  id: string
  name?: string
  description?: string
  context_length?: number
  pricing?: {
    prompt?: number
    completion?: number
  }
}

interface OpenRouterModelsResponse {
  data: OpenRouterModel[]
}

/**
 * Fetch available models from the provider's /models endpoint
 */
export async function fetchProviderModels(
  provider?: ProviderId,
): Promise<FetchedModel[] | null> {
  const providerManager = ProviderManager.getInstance()
  const activeProvider = provider ?? providerManager.getActiveProviderName()

  // Get the models URL from provider registry
  const { PROVIDER_REGISTRY } = await import(
    '../../services/ai/providerRegistry.js'
  )
  const registryEntry = PROVIDER_REGISTRY[activeProvider]

  if (!('modelsUrl' in registryEntry) || !registryEntry.modelsUrl) {
    console.log(`[fetchProviderModels] No modelsUrl for provider: ${activeProvider}`)
    return null
  }

  const apiKey = providerManager.getApiKeyForProvider(activeProvider)
  if (!apiKey) {
    console.log(`[fetchProviderModels] No API key for provider: ${activeProvider}`)
    return null
  }

  const modelsUrl = (registryEntry as { modelsUrl?: string }).modelsUrl
  if (!modelsUrl) {
    return null
  }

  try {
    console.log(`[fetchProviderModels] Fetching from: ${modelsUrl}`)

    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }

    if (activeProvider === 'google') {
      headers['x-goog-api-key'] = apiKey;
    }

    const response = await fetch(modelsUrl, {
      method: 'GET',
      headers,
    })

    if (!response.ok) {
      console.error(
        `[fetchProviderModels] HTTP error: ${response.status} ${response.statusText}`,
      )
      return null
    }

    const data = (await response.json()) as
      | OpenAIModelsResponse
      | OpenRouterModelsResponse
      | { data?: unknown }

    // Handle OpenAI-compatible format (OpenAI, DeepSeek, Groq, etc.)
    if ('object' in data && data.object === 'list' && Array.isArray(data.data)) {
      return data.data.map((model) => ({
        id: model.id,
        label: model.id,
        description: model.owned_by
          ? `Owned by: ${model.owned_by}`
          : undefined,
      }))
    }

    // Handle OpenRouter format (has architecture field and uses provider/model format)
    if ('data' in data && Array.isArray(data.data) && data.data.length > 0 && 'architecture' in data.data[0]) {
      return data.data.map((model: OpenRouterModel) => ({
        id: model.id,
        label: model.name ?? model.id,
        description: model.description,
        contextWindow: model.context_length,
      })).filter(model => {
        // Filter out models that don't have the provider/model format
        // OpenRouter requires model IDs in the format: provider/model
        return model.id.includes('/')
      })
    }

    // Handle generic format with data array (fallback for other providers)
    if ('data' in data && Array.isArray(data.data)) {
      return data.data.map((model: any) => ({
        id: model.id || model.name,
        label: model.name || model.id || 'Unknown',
        description: model.description,
        contextWindow: model.context_length || model.context_window,
      }))
    }

    console.error('[fetchProviderModels] Unknown response format:', data)
    return null
  } catch (error) {
    console.error('[fetchProviderModels] Error fetching models:', error)
    return null
  }
}

/**
 * Check if the provider supports fetching models
 */
export function supportsModelFetching(provider?: ProviderId): boolean {
  const providerManager = ProviderManager.getInstance()
  const activeProvider = provider ?? providerManager.getActiveProviderName()

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
      'kilocode',
      'google',
    ]

    return supportedProviders.includes(activeProvider)
  } catch {
    return false
  }
}
