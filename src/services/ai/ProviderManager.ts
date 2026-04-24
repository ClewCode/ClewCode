import { readFileSync } from 'fs'
import { join } from 'path'
import { AnthropicProvider } from './providers/AnthropicProvider.js'
import { GoogleProvider } from './providers/GoogleProvider.js'
import { OpenAICompatibleProvider } from './providers/OpenAICompatibleProvider.js'
import { OpenAIProvider } from './providers/OpenAIProvider.js'
import type { ProviderId, ProviderInitOptions, ProviderInterface } from './providers/ProviderInterface.js'
import { PROVIDER_METADATA, type ProviderMetadata } from './providerMetadata.js'

const PROVIDER_CONFIG_PATH = join(process.env.HOME || process.env.USERPROFILE || '', '.claude-code-provider.json')
const DEFAULT_PROVIDER: ProviderId = 'anthropic'

const PROVIDERS: Record<ProviderId, ProviderInterface> = {
  anthropic: new AnthropicProvider(),
  openai: new OpenAIProvider(),
  google: new GoogleProvider(),
  gemini: new OpenAICompatibleProvider(
    'gemini',
    'Google Gemini',
    'GEMINI_API_KEY',
    'https://generativelanguage.googleapis.com/v1beta/openai',
  ),
  openrouter: new OpenAICompatibleProvider(
    'openrouter',
    'OpenRouter',
    'OPENROUTER_API_KEY',
    'https://openrouter.ai/api/v1',
  ),
  opencode: new OpenAICompatibleProvider(
    'opencode',
    'OpenCode',
    'OPENCODE_API_KEY',
    'https://opencode.ai/zen/v1',
  ),
  cline: new OpenAICompatibleProvider(
    'cline',
    'Cline API',
    'CLINE_API_KEY',
    'https://api.cline.bot/api/v1',
  ),
  groq: new OpenAICompatibleProvider(
    'groq',
    'Groq',
    'GROQ_API_KEY',
    'https://api.groq.com/openai/v1',
  ),
  xai: new OpenAICompatibleProvider(
    'xai',
    'xAI',
    'XAI_API_KEY',
    'https://api.x.ai/v1',
  ),
  mistral: new OpenAICompatibleProvider(
    'mistral',
    'Mistral',
    'MISTRAL_API_KEY',
    'https://api.mistral.ai/v1',
  ),
  kilocode: new OpenAICompatibleProvider(
    'kilocode',
    'KiloCode',
    'KILOCODE_API_KEY',
    'https://api.kilo.ai/api/gateway',
  ),
  ollama: new OpenAICompatibleProvider(
    'ollama',
    'Ollama (Local)',
    'OLLAMA_API_KEY',
    'http://localhost:11434/v1',
  ),
}

export type ProviderConfigFile = {
  provider?: ProviderId
  model?: string
  providerConfig?: Record<string, unknown>
}

export const PROVIDER_METADATA_BY_ID: Record<ProviderId, ProviderMetadata> = PROVIDER_METADATA

export class ProviderManager {
  private static instance: ProviderManager | null = null

  static getInstance(): ProviderManager {
    if (!ProviderManager.instance) {
      ProviderManager.instance = new ProviderManager()
    }
    return ProviderManager.instance
  }

  getProviderConfigPath(): string {
    return PROVIDER_CONFIG_PATH
  }

  getSelectedProviderConfig(): ProviderConfigFile {
    try {
      const content = readFileSync(this.getProviderConfigPath(), 'utf8')
      return JSON.parse(content) as ProviderConfigFile
    } catch {
      return {}
    }
  }

  getActiveProviderName(): ProviderId {
    const forcedProvider = process.env.AI_PROVIDER?.toLowerCase() as ProviderId | undefined
    if (forcedProvider && PROVIDERS[forcedProvider]) {
      return forcedProvider
    }

    const config = this.getSelectedProviderConfig()
    if (config.provider && PROVIDERS[config.provider]) {
      return config.provider
    }

    return DEFAULT_PROVIDER
  }

  getProvider(provider?: ProviderId): ProviderInterface {
    const providerName = provider ?? this.getActiveProviderName()
    const providerInstance = PROVIDERS[providerName]
    if (!providerInstance) {
      throw new Error(`Unsupported provider: ${providerName}`)
    }
    return providerInstance
  }

  getApiKeyForProvider(provider?: ProviderId): string | undefined {
    const providerName = provider ?? this.getActiveProviderName()
    const instance = this.getProvider(providerName)
    return process.env[instance.getProviderApiKeyEnvVar()] || undefined
  }

  getBaseUrlForProvider(provider?: ProviderId): string | undefined {
    const config = this.getSelectedProviderConfig()
    const providerConfig = config.providerConfig
    if (providerConfig && typeof providerConfig.baseUrl === 'string') {
      return providerConfig.baseUrl
    }
    return undefined
  }

  getModelForProvider(provider?: ProviderId): string | undefined {
    const config = this.getSelectedProviderConfig()
    return config.model
  }

  async createClient(provider?: ProviderId, options: ProviderInitOptions = {}): Promise<unknown> {
    const effectiveProvider = provider ?? this.getActiveProviderName()
    const providerInstance = this.getProvider(effectiveProvider)

    const apiKey = options.apiKey ?? this.getApiKeyForProvider(effectiveProvider)
    const baseUrl = options.baseUrl ?? this.getBaseUrlForProvider(effectiveProvider)
    const model = options.model ?? this.getModelForProvider(effectiveProvider)

    return providerInstance.createClient({
      ...options,
      apiKey,
      baseUrl,
      model,
    })
  }
}
