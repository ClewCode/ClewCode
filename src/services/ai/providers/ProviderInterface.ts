import type { ClientOptions } from '@anthropic-ai/sdk';

export type ProviderId =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'openrouter'
  | 'opencode'
  | 'opencode-go'
  | 'cline'
  | 'groq'
  | 'xai'
  | 'mistral'
  | 'kilocode'
  | 'ollama'
  | 'deepseek'
  | 'together'
  | 'fireworks'
  | 'nvidia'
  | 'cohere'
  | 'deepinfra'
  | 'perplexity'
  | 'cerebras'
  | 'siliconflow'
  | 'moonshot'
  | 'zhipu'
  | 'huggingface'
  | 'poe'
  | 'digitalocean'
  | 'clew-gateway'
  | 'custom';

export interface ProviderInitOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  fetchOverride?: ClientOptions['fetch'];
  source?: string;
  maxRetries?: number;
}

export type ProviderClient = unknown;

export interface ProviderInterface {
  readonly providerId: ProviderId;
  readonly label: string;
  getProviderId(): ProviderId;
  getProviderLabel(): string;
  getProviderApiKeyEnvVar(): string;
  createClient(options: ProviderInitOptions): Promise<ProviderClient>;
  listModels(options: ProviderInitOptions): Promise<Array<{ id: string; label: string }>>;
}
