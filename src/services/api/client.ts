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
  // For now, always use Anthropic client directly
  // TODO: Support other providers through abstraction layer
  console.error(`[getAIProviderClient] Creating Anthropic client, provider=${provider}, model=${model}`)
  const client = await getAnthropicClient({ apiKey, maxRetries, model, fetchOverride, source })
  console.error(`[getAIProviderClient] Client created, has beta: ${'beta' in client}, beta type: ${typeof client.beta}, has messages: ${client.beta ? 'messages' in client.beta : false}`)
  return client
}

export const CLIENT_REQUEST_ID_HEADER = 'x-client-request-id'
