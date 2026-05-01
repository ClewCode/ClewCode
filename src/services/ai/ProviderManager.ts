import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { ProviderId, ProviderInitOptions, ProviderInterface } from './providers/ProviderInterface.js'
import {
  createProviderInstance,
  DEFAULT_PROVIDER,
  getProviderOptions,
  PROVIDER_REGISTRY,
} from './providerRegistry.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { existsSync, renameSync, mkdirSync } from 'fs'
import { ChatGPTSessionProvider } from './providers/ChatGPTSessionProvider.js'

const LEGACY_PROVIDER_CONFIG_PATH = join(process.env.HOME || process.env.USERPROFILE || '', '.claude-code-provider.json')
const PREVIOUS_PROVIDER_CONFIG_PATH = join(getClaudeConfigHomeDir(), '.provider.json')
export const PROVIDER_CONFIG_PATH = join(getClaudeConfigHomeDir(), 'provider.json')

export function getProjectProviderConfigPath(): string | null {
  const cwd = process.cwd()
  const projectPath = join(cwd, '.claude', 'provider.json')
  return existsSync(projectPath) ? projectPath : null
}

export function getEffectiveProviderConfigPath(): string {
  return getProjectProviderConfigPath() ?? PROVIDER_CONFIG_PATH
}

/**
 * Migrates the legacy provider config to the new location if it exists.
 */
function migrateLegacyConfig(): void {
  try {
    // 1. Migrate from absolute legacy path (~/.claude-code-provider.json)
    if (existsSync(LEGACY_PROVIDER_CONFIG_PATH) && !existsSync(PROVIDER_CONFIG_PATH)) {
      const targetDir = getClaudeConfigHomeDir()
      if (!existsSync(targetDir)) {
        mkdirSync(targetDir, { recursive: true })
      }
      renameSync(LEGACY_PROVIDER_CONFIG_PATH, PROVIDER_CONFIG_PATH)
      console.log(`[ProviderManager] Migrated provider config from ${LEGACY_PROVIDER_CONFIG_PATH} to ${PROVIDER_CONFIG_PATH}`)
    }

    // 2. Migrate from previous dot-file path (~/.claude/.provider.json)
    if (existsSync(PREVIOUS_PROVIDER_CONFIG_PATH) && !existsSync(PROVIDER_CONFIG_PATH)) {
      renameSync(PREVIOUS_PROVIDER_CONFIG_PATH, PROVIDER_CONFIG_PATH)
      console.log(`[ProviderManager] Migrated provider config from ${PREVIOUS_PROVIDER_CONFIG_PATH} to ${PROVIDER_CONFIG_PATH}`)
    }
  } catch (error) {
    // Silently fail on migration errors, we'll just use the new path
    console.error(`[ProviderManager] Failed to migrate legacy config: ${(error as Error).message}`)
  }
}

// Run migration on module load
migrateLegacyConfig()

export type ProviderConfigFile = {
  provider?: ProviderId
  model?: string
  apiKeys?: Partial<Record<ProviderId, string>>
  providerConfig?: Record<string, unknown>
}

export class ProviderManager {
  private static instance: ProviderManager | null = null
  private cachedConfig: ProviderConfigFile | null = null
  private sessionProvider: ProviderId | null = null
  private sessionModel: string | null = null
  private sessionApiKeys: Partial<Record<ProviderId, string>> = {}

  static getInstance(): ProviderManager {
    if (!ProviderManager.instance) {
      ProviderManager.instance = new ProviderManager()
    }
    return ProviderManager.instance
  }

  getProviderConfigPath(): string {
    return getEffectiveProviderConfigPath()
  }

  getProviderConfigPathForSave(): string {
    const projectPath = getProjectProviderConfigPath()
    return projectPath ?? PROVIDER_CONFIG_PATH
  }

  invalidateConfigCache(): void {
    this.cachedConfig = null
  }

  setSessionProvider(provider: ProviderId | null): void {
    this.sessionProvider = provider
  }

  setSessionModel(model: string | null): void {
    this.sessionModel = model
  }

  setSessionApiKeys(apiKeys: Partial<Record<ProviderId, string>>): void {
    this.sessionApiKeys = { ...this.sessionApiKeys, ...apiKeys }
  }

  getSelectedProviderConfig(forceReload = false): ProviderConfigFile {
    if (this.cachedConfig && !forceReload) {
      return this.cachedConfig
    }

    try {
      const content = readFileSync(this.getProviderConfigPath(), 'utf8')
      this.cachedConfig = JSON.parse(content) as ProviderConfigFile
      return this.cachedConfig
    } catch {
      this.cachedConfig = {}
      return {}
    }
  }

  saveSelectedProviderConfig(config: ProviderConfigFile): void {
    writeFileSync(
      this.getProviderConfigPathForSave(),
      JSON.stringify(config, null, 2),
      'utf8',
    )
    this.cachedConfig = config
  }

  getActiveProviderName(): ProviderId {
    if (this.sessionProvider) {
      return this.sessionProvider
    }

    const forcedProvider = process.env.AI_PROVIDER?.toLowerCase() as ProviderId | undefined
    if (forcedProvider && PROVIDER_REGISTRY[forcedProvider]) {
      return forcedProvider
    }

    const config = this.getSelectedProviderConfig()
    if (config.provider && PROVIDER_REGISTRY[config.provider]) {
      return config.provider
    }

    const { isEnvTruthy } = require('../../utils/envUtils.js')
    if (
      isEnvTruthy(process.env.CLAUDE_CODE_USE_BEDROCK) ||
      isEnvTruthy(process.env.CLAUDE_CODE_USE_VERTEX) ||
      isEnvTruthy(process.env.CLAUDE_CODE_USE_FOUNDRY)
    ) {
      return 'anthropic'
    }

    return DEFAULT_PROVIDER
  }

  getImplementationType(): string {
    const config = this.getSelectedProviderConfig()
    const provider = this.getActiveProviderName()
    if (provider === 'anthropic') return (config.providerConfig as any)?.anthropicType || 'direct'
    if (provider === 'google') return (config.providerConfig as any)?.googleType || 'direct'
    if (provider === 'openai') return (config.providerConfig as any)?.openaiType || 'direct'
    return 'direct'
  }

  /**
   * Returns the legacy Anthropic-specific provider type.
   * Only relevant when the active provider is 'anthropic'.
   */
  getAnthropicProviderType(): 'firstParty' | 'bedrock' | 'vertex' | 'foundry' {
    const config = this.getSelectedProviderConfig()
    if (config.provider === 'anthropic' && (config.providerConfig as any)?.anthropicType) {
      const type = (config.providerConfig as any).anthropicType
      if (type === 'direct' || type === 'subscriber') return 'firstParty'
      return type
    }

    const { isEnvTruthy } = require('../../utils/envUtils.js')
    return isEnvTruthy(process.env.CLAUDE_CODE_USE_BEDROCK)
      ? 'bedrock'
      : isEnvTruthy(process.env.CLAUDE_CODE_USE_VERTEX)
        ? 'vertex'
        : isEnvTruthy(process.env.CLAUDE_CODE_USE_FOUNDRY)
          ? 'foundry'
          : 'firstParty'
  }

  /**
   * Check if ANTHROPIC_BASE_URL is a first-party Anthropic API URL.
   */
  isFirstPartyAnthropicBaseUrl(): boolean {
    const baseUrl = process.env.ANTHROPIC_BASE_URL
    if (!baseUrl) {
      return true
    }
    try {
      const host = new URL(baseUrl).host
      const allowedHosts = ['api.anthropic.com']
      if (process.env.USER_TYPE === 'ant') {
        allowedHosts.push('api-staging.anthropic.com')
      }
      return allowedHosts.includes(host)
    } catch {
      return false
    }
  }

  getProvider(provider?: ProviderId): ProviderInterface {
    const providerName = provider ?? this.getActiveProviderName()
    const config = this.getSelectedProviderConfig()

    // Handle OpenAI Subscriber (Web Session)
    if (providerName === 'openai' && (config.providerConfig as any)?.openaiType === 'subscriber') {
      return new ChatGPTSessionProvider() as any
    }

    const providerEntry = PROVIDER_REGISTRY[providerName]
    if (!providerEntry) {
      throw new Error(`Unsupported provider: ${providerName}`)
    }
    return providerEntry.provider
  }

  getApiKeyForProvider(provider?: ProviderId): string | undefined {
    const providerName = provider ?? this.getActiveProviderName()
    if (this.sessionApiKeys[providerName]) {
      return this.sessionApiKeys[providerName]
    }
    const providerEntry = PROVIDER_REGISTRY[providerName]
    const config = this.getSelectedProviderConfig()
    return config.apiKeys?.[providerName] || (providerEntry?.envKey ? process.env[providerEntry.envKey] : undefined) || undefined
  }

  getBaseUrlForProvider(provider?: ProviderId): string | undefined {
    const config = this.getSelectedProviderConfig()
    const providerConfig = config.providerConfig
    if (providerConfig && typeof providerConfig.baseUrl === 'string') {
      return providerConfig.baseUrl
    }
    const providerName = provider ?? this.getActiveProviderName()
    return getProviderOptions(providerName).baseUrl
  }

  getModelForProvider(provider?: ProviderId): string | undefined {
    if (!provider && this.sessionModel) {
      return this.sessionModel
    }
    const config = this.getSelectedProviderConfig()
    return config.model
  }

  async createClient(provider?: ProviderId, options: ProviderInitOptions = {}): Promise<unknown> {
    const effectiveProvider = provider ?? this.getActiveProviderName()
    const providerInstance = this.getProvider(effectiveProvider)

    if (effectiveProvider === 'anthropic') {
      const type = this.getAnthropicProviderType()
      // Clear all first to ensure only one is active
      delete process.env.CLAUDE_CODE_USE_BEDROCK
      delete process.env.CLAUDE_CODE_USE_VERTEX
      delete process.env.CLAUDE_CODE_USE_FOUNDRY

      if (type === 'bedrock') process.env.CLAUDE_CODE_USE_BEDROCK = 'true'
      if (type === 'vertex') process.env.CLAUDE_CODE_USE_VERTEX = 'true'
      if (type === 'foundry') process.env.CLAUDE_CODE_USE_FOUNDRY = 'true'
    }

    if (effectiveProvider === 'google') {
      const config = this.getSelectedProviderConfig()
      const type = (config.providerConfig as any)?.googleType
      if (type === 'vertex') {
        process.env.GOOGLE_USE_VERTEX = 'true'
      } else {
        delete process.env.GOOGLE_USE_VERTEX
      }
    }

    if (effectiveProvider === 'openai') {
      const config = this.getSelectedProviderConfig()
      const type = (config.providerConfig as any)?.openaiType
      if (type === 'azure') {
        process.env.OPENAI_USE_AZURE = 'true'
      } else {
        delete process.env.OPENAI_USE_AZURE
      }
    }

    const apiKey = options.apiKey ?? this.getApiKeyForProvider(effectiveProvider)
    const baseUrl = options.baseUrl ?? this.getBaseUrlForProvider(effectiveProvider)
    const model = options.model ?? this.getModelForProvider(effectiveProvider)

    const config = this.getSelectedProviderConfig()
    return providerInstance.createClient({
      ...options,
      ...(config.providerConfig as any),
      apiKey,
      baseUrl,
      model,
    })
  }
}
