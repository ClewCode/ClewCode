import type { ClientOptions } from '@anthropic-ai/sdk'

export type ProviderId =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'gemini'
  | 'openrouter'
  | 'opencode'
  | 'cline'
  | 'groq'
  | 'xai'
  | 'mistral'
  | 'kilocode'
  | 'ollama'

export interface ProviderInitOptions {
  apiKey?: string
  baseUrl?: string
  model?: string
  fetchOverride?: ClientOptions['fetch']
  source?: string
  maxRetries?: number
}

export type ProviderClient = unknown

export interface ProviderInterface {
  readonly providerId: ProviderId
  readonly label: string
  getProviderId(): ProviderId
  getProviderLabel(): string
  getProviderApiKeyEnvVar(): string
  createClient(options: ProviderInitOptions): Promise<ProviderClient>
}
