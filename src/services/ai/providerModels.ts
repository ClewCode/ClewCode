import { ProviderManager } from './ProviderManager.js'
import {
  getProviderRegistryEntry,
  type ProviderModelInfo,
} from './providerRegistry.js'
import type { ProviderId } from './providers/ProviderInterface.js'

type RemoteModelPayload = {
  id?: string
  name?: string
  supported_parameters?: string[]
  capabilities?: { tools?: boolean; tool_calling?: boolean }
}

const MODELS_CACHE = new Map<ProviderId, { data: ProviderModelInfo[]; timestamp: number }>()
const MODELS_CACHE_TTL_MS = 5 * 60 * 1000

export function clearProviderModelsCache(provider?: ProviderId): void {
  if (provider) {
    MODELS_CACHE.delete(provider)
    return
  }

  MODELS_CACHE.clear()
}

export async function fetchProviderModels(
  provider: ProviderId,
): Promise<ProviderModelInfo[]> {
  const cached = MODELS_CACHE.get(provider)
  if (cached && Date.now() - cached.timestamp < MODELS_CACHE_TTL_MS) {
    return cached.data
  }

  const info = getProviderRegistryEntry(provider)
  const providerManager = ProviderManager.getInstance()
  const config = providerManager.getSelectedProviderConfig(true)
  const apiKey = config.apiKeys?.[provider] || process.env[info.envKey]

  if (!info.modelsUrl) {
    return cacheAndReturn(provider, info.models)
  }

  if (!apiKey && !info.isLocal) {
    throw new Error(`API key required. Run: /providers key ${provider} <your-api-key>`)
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (apiKey) {
    if (provider === 'anthropic') {
      headers['x-api-key'] = apiKey
      headers['anthropic-version'] = '2023-06-01'
    } else {
      headers.Authorization = `Bearer ${apiKey}`
    }
  }

  try {
    console.log(`[fetchProviderModels] Fetching from: ${info.modelsUrl}`)
    const response = await fetch(info.modelsUrl, {
      headers,
      signal: AbortSignal.timeout(5000), // 5s timeout instead of 30s
    })

    console.log(`[fetchProviderModels] Response status: ${response.status}`)

    if (!response.ok) {
      console.error(`[fetchProviderModels] HTTP error: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as {
      data?: RemoteModelPayload[]
      models?: RemoteModelPayload[]
    }

    console.log(`[fetchProviderModels] Response data keys:`, Object.keys(data))
    console.log(`[fetchProviderModels] Raw data count:`, (data.data ?? data.models ?? []).length)

    const models = (data.data ?? data.models ?? [])
      .map(model => toProviderModelInfo(provider, model))
      .filter((model): model is ProviderModelInfo => Boolean(model))

    console.log(`[fetchProviderModels] Parsed models count: ${models.length}`)

    if (models.length > 0) {
      return cacheAndReturn(provider, models)
    }
  } catch (error) {
    console.error(`[fetchProviderModels] Error fetching for ${provider}:`, error)
    // Fall back to registry models below.
  }

  return cacheAndReturn(provider, getFallbackModels(provider))
}

function cacheAndReturn(
  provider: ProviderId,
  data: ProviderModelInfo[],
): ProviderModelInfo[] {
  MODELS_CACHE.set(provider, { data, timestamp: Date.now() })
  return data
}

function getFallbackModels(provider: ProviderId): ProviderModelInfo[] {
  const info = getProviderRegistryEntry(provider)
  if (info.models.length > 0) {
    return info.models
  }

  if (!info.defaultModel) {
    return []
  }

  return [
    {
      id: info.defaultModel,
      label: info.defaultModel,
      capabilities: {
        toolCalling: info.capabilities.toolCalling ? 'native' : 'none',
        vision: info.capabilities.vision,
        streaming: info.capabilities.streaming,
        maxContext: 'varies',
        maxOutput: 'varies',
        reasoning: info.capabilities.reasoningEffort,
        supportsSystemPrompt: true,
      },
      tags: ['default'],
    },
  ]
}

function toProviderModelInfo(
  provider: ProviderId,
  model: RemoteModelPayload,
): ProviderModelInfo | null {
  const id = model.id ?? model.name
  if (!id) {
    return null
  }

  const info = getProviderRegistryEntry(provider)
  const toolCalling = modelSupportsToolCalling(provider, id, model)

  return {
    id,
    label: model.name && model.name !== id ? model.name : id,
    capabilities: {
      toolCalling: toolCalling ? 'native' : 'none',
      vision: info.capabilities.vision,
      streaming: info.capabilities.streaming,
      maxContext: 'varies',
      maxOutput: 'varies',
      reasoning: info.capabilities.reasoningEffort,
      supportsSystemPrompt: true,
    },
    tags: buildTags(toolCalling, model),
  }
}

function buildTags(
  toolCalling: boolean,
  model: RemoteModelPayload,
): string[] | undefined {
  const tags: string[] = []
  if (toolCalling) {
    tags.push('tools')
  }
  if (model.name && model.id && model.name !== model.id) {
    tags.push('api')
  }
  return tags.length > 0 ? tags : undefined
}

function modelSupportsToolCalling(
  provider: ProviderId,
  model: string,
  metadata?: RemoteModelPayload,
): boolean {
  const normalized = model.toLowerCase()
  if (provider === 'kilocode' && normalized === 'tencent/hy3-preview:free') {
    return false
  }

  if (provider === 'anthropic') {
    return true
  }

  const params = metadata?.supported_parameters
  if (Array.isArray(params)) {
    return params.includes('tools') || params.includes('tool_choice')
  }

  if (metadata?.capabilities) {
    return Boolean(
      metadata.capabilities.tools || metadata.capabilities.tool_calling,
    )
  }

  return getProviderRegistryEntry(provider).capabilities.toolCalling
}
