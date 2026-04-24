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
  return ProviderManager.getInstance().createClient(provider, {
    apiKey,
    maxRetries,
    model,
    fetchOverride,
    source,
  })
}

export const CLIENT_REQUEST_ID_HEADER = 'x-client-request-id'
