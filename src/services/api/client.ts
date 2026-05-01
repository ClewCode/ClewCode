import type { ClientOptions } from '@anthropic-ai/sdk'
import type { ProviderId } from '../ai/providers/ProviderInterface.js'
import { ProviderManager } from '../ai/ProviderManager.js'
import { createAnthropicClient } from './anthropicClient.js'

export async function getAnthropicClient({
  apiKey,
  maxRetries,
  model,
  fetchOverride,
  source,
}: {
  apiKey?: string
  maxRetries: number
  model?: string
  fetchOverride?: ClientOptions['fetch']
  source?: string
}): Promise<Awaited<ReturnType<typeof createAnthropicClient>>> {
  return createAnthropicClient({ apiKey, maxRetries, model, fetchOverride, source })
}

import { AnthropicAdapter } from '../ai/adapter/AnthropicAdapter.js'

export async function getAIProviderClient({
  provider,
  apiKey,
  maxRetries,
  model,
  fetchOverride,
  source,
}: {
  provider?: ProviderId
  apiKey?: string
  maxRetries: number
  model?: string
  fetchOverride?: ClientOptions['fetch']
  source?: string
}): Promise<any> {
  const providerManager = ProviderManager.getInstance()
  const effectiveProvider = provider ?? providerManager.getActiveProviderName()

  if (effectiveProvider === 'anthropic') {
    return getAnthropicClient({ apiKey, maxRetries, model, fetchOverride, source })
  }

  // Use ProviderManager for other providers
  const client = await providerManager.createClient(effectiveProvider, {
    apiKey,
    model,
    fetchOverride,
    source,
    maxRetries
  })

  // Wrap in AnthropicAdapter to maintain compatibility with existing code
  return new AnthropicAdapter(client, effectiveProvider)
}

export const CLIENT_REQUEST_ID_HEADER = 'x-client-request-id'
