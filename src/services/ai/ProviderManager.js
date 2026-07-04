import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { join } from 'path';
import { DOT_CLEW } from '../../utils/clewPaths.js';
import { getClewConfigHomeDir } from '../../utils/envUtils.js';
import { readLocalProviderKey } from '../../utils/localProviderKeys.js';
import {
  DEFAULT_PROVIDER,
  getProviderOptions,
  getProviderRegistryEntry,
  normalizeProviderId,
  PROVIDER_REGISTRY,
} from './providerRegistry.js';

const LEGACY_PROVIDER_CONFIG_PATH = join(process.env.HOME || process.env.USERPROFILE || '', '.clew-code-provider.json');
const PREVIOUS_PROVIDER_CONFIG_PATH = join(getClewConfigHomeDir(), '.provider.json');
export const PROVIDER_CONFIG_PATH = join(getClewConfigHomeDir(), 'provider.json');
export function getProjectProviderConfigPath() {
  const cwd = process.cwd();
  const projectPath = join(cwd, DOT_CLEW, 'provider.json');
  return existsSync(projectPath) ? projectPath : null;
}
export function getEffectiveProviderConfigPath() {
  return getProjectProviderConfigPath() ?? PROVIDER_CONFIG_PATH;
}
/**
 * Migrates the legacy provider config to the new location if it exists.
 */
function migrateLegacyConfig() {
  try {
    // 1. Migrate from absolute legacy path (~/.clew-code-provider.json)
    if (existsSync(LEGACY_PROVIDER_CONFIG_PATH) && !existsSync(PROVIDER_CONFIG_PATH)) {
      const targetDir = getClewConfigHomeDir();
      if (!existsSync(targetDir)) {
        mkdirSync(targetDir, { recursive: true });
      }
      renameSync(LEGACY_PROVIDER_CONFIG_PATH, PROVIDER_CONFIG_PATH);
      console.log(
        `[ProviderManager] Migrated provider config from ${LEGACY_PROVIDER_CONFIG_PATH} to ${PROVIDER_CONFIG_PATH}`,
      );
    }
    // 2. Migrate from previous dot-file path (~/.clew/.provider.json)
    if (existsSync(PREVIOUS_PROVIDER_CONFIG_PATH) && !existsSync(PROVIDER_CONFIG_PATH)) {
      renameSync(PREVIOUS_PROVIDER_CONFIG_PATH, PROVIDER_CONFIG_PATH);
      console.log(
        `[ProviderManager] Migrated provider config from ${PREVIOUS_PROVIDER_CONFIG_PATH} to ${PROVIDER_CONFIG_PATH}`,
      );
    }
  } catch (error) {
    // Silently fail on migration errors, we'll just use the new path
    console.error(`[ProviderManager] Failed to migrate legacy config: ${error.message}`);
  }
}
// Run migration on module load
migrateLegacyConfig();
/**
 * In-memory migration of legacy provider IDs (e.g. gemini -> google) in a
 * loaded provider.json. Non-destructive: the file on disk is untouched, and
 * legacy apiKeys entries are copied to the canonical ID rather than removed,
 * so downgrading to an older Clew Code version keeps working.
 */
export function normalizeLegacyProviderConfig(config) {
  if (config.provider) {
    const canonical = normalizeProviderId(config.provider);
    if (canonical && canonical !== config.provider) {
      config.provider = canonical;
    }
  }
  if (config.apiKeys) {
    for (const [key, value] of Object.entries(config.apiKeys)) {
      const canonical = normalizeProviderId(key);
      if (canonical && canonical !== key && !config.apiKeys[canonical]) {
        config.apiKeys[canonical] = value;
      }
    }
  }
  return config;
}
export class ProviderManager {
  static instance = null;
  cachedConfig = null;
  sessionProvider = null;
  sessionModel = null;
  sessionApiKeys = {};
  static getInstance() {
    if (!ProviderManager.instance) {
      ProviderManager.instance = new ProviderManager();
    }
    return ProviderManager.instance;
  }
  getProviderConfigPath() {
    return getEffectiveProviderConfigPath();
  }
  getProviderConfigPathForSave() {
    const projectPath = getProjectProviderConfigPath();
    return projectPath ?? PROVIDER_CONFIG_PATH;
  }
  invalidateConfigCache() {
    this.cachedConfig = null;
  }
  setSessionProvider(provider) {
    this.sessionProvider = provider ? (normalizeProviderId(provider) ?? provider) : null;
  }
  setSessionModel(model) {
    this.sessionModel = model;
  }
  setSessionApiKeys(apiKeys) {
    this.sessionApiKeys = { ...this.sessionApiKeys, ...apiKeys };
  }
  getSelectedProviderConfig(forceReload = false) {
    if (this.cachedConfig && !forceReload) {
      return this.cachedConfig;
    }
    try {
      const content = readFileSync(this.getProviderConfigPath(), 'utf8');
      this.cachedConfig = normalizeLegacyProviderConfig(JSON.parse(content));
      return this.cachedConfig;
    } catch {
      this.cachedConfig = {};
      return {};
    }
  }
  saveSelectedProviderConfig(config) {
    writeFileSync(this.getProviderConfigPathForSave(), JSON.stringify(config, null, 2), 'utf8');
    this.cachedConfig = config;
  }
  getActiveProviderName() {
    if (this.sessionProvider) {
      return this.sessionProvider;
    }
    const forcedProvider = normalizeProviderId(process.env.AI_PROVIDER);
    if (forcedProvider) {
      return forcedProvider;
    }
    const config = this.getSelectedProviderConfig();
    const configProvider = normalizeProviderId(config.provider);
    if (configProvider) {
      return configProvider;
    }
    const { isEnvTruthy } = require('../../utils/envUtils.js');
    if (
      isEnvTruthy(process.env.CLEW_CODE_USE_BEDROCK) ||
      isEnvTruthy(process.env.CLEW_CODE_USE_VERTEX) ||
      isEnvTruthy(process.env.CLEW_CODE_USE_FOUNDRY)
    ) {
      return 'anthropic';
    }
    return DEFAULT_PROVIDER;
  }
  getImplementationType() {
    const config = this.getSelectedProviderConfig();
    const provider = this.getActiveProviderName();
    if (provider === 'anthropic') return config.providerConfig?.anthropicType || 'direct';
    if (provider === 'google') return config.providerConfig?.googleType || 'direct';
    if (provider === 'openai') return config.providerConfig?.openaiType || 'direct';
    return 'direct';
  }
  /**
   * Returns the legacy Anthropic-specific provider type.
   * Only relevant when the active provider is 'anthropic'.
   */
  getAnthropicProviderType() {
    const config = this.getSelectedProviderConfig();
    if (config.provider === 'anthropic' && config.providerConfig?.anthropicType) {
      const type = config.providerConfig.anthropicType;
      if (type === 'bedrock' || type === 'vertex' || type === 'foundry') return type;
      return 'firstParty';
    }
    const { isEnvTruthy } = require('../../utils/envUtils.js');
    return isEnvTruthy(process.env.CLEW_CODE_USE_BEDROCK)
      ? 'bedrock'
      : isEnvTruthy(process.env.CLEW_CODE_USE_VERTEX)
        ? 'vertex'
        : isEnvTruthy(process.env.CLEW_CODE_USE_FOUNDRY)
          ? 'foundry'
          : 'firstParty';
  }
  /**
   * Check if ANTHROPIC_BASE_URL is a first-party Anthropic API URL.
   */
  isFirstPartyAnthropicBaseUrl() {
    const baseUrl = process.env.ANTHROPIC_BASE_URL;
    if (!baseUrl) {
      return true;
    }
    try {
      const host = new URL(baseUrl).host;
      const allowedHosts = ['api.anthropic.com'];
      if (process.env.USER_TYPE === 'ant') {
        allowedHosts.push('api-staging.anthropic.com');
      }
      return allowedHosts.includes(host);
    } catch {
      return false;
    }
  }
  getProvider(provider) {
    const providerName = provider ?? this.getActiveProviderName();
    const providerEntry = PROVIDER_REGISTRY[providerName];
    if (!providerEntry) {
      throw new Error(`Unsupported provider: ${providerName}`);
    }
    return providerEntry.provider;
  }
  getApiKeyForProvider(provider) {
    const providerName = provider ?? this.getActiveProviderName();
    if (this.sessionApiKeys[providerName]) {
      return this.sessionApiKeys[providerName];
    }
    const providerEntry = PROVIDER_REGISTRY[providerName];
    const config = this.getSelectedProviderConfig();
    return (
      config.apiKeys?.[providerName] ||
      (providerEntry?.envKey ? process.env[providerEntry.envKey] : undefined) ||
      (providerName === 'huggingface' ? process.env.HUGGINGFACE_API_KEY : undefined) ||
      readLocalProviderKey(providerName) ||
      undefined
    );
  }
  getBaseUrlForProvider(provider) {
    // When a session override or explicit provider ID is given, use that
    // provider's built-in defaultBaseUrl from the registry instead of the
    // persisted providerConfig.baseUrl (which may belong to a different provider).
    const effectiveProvider = provider ?? this.getActiveProviderName();
    // Custom provider always reads baseUrl from config (no built-in default)
    if (effectiveProvider === 'custom') {
      const config = this.getSelectedProviderConfig();
      if (config.providerConfig && typeof config.providerConfig.baseUrl === 'string') {
        return config.providerConfig.baseUrl;
      }
      return getProviderOptions(effectiveProvider).baseUrl;
    }
    if (this.sessionProvider || provider) {
      return getProviderOptions(effectiveProvider).baseUrl;
    }
    const config = this.getSelectedProviderConfig();
    const registryEntry = getProviderRegistryEntry(effectiveProvider);
    if (
      config.providerConfig &&
      typeof config.providerConfig.baseUrl === 'string' &&
      (!config.providerConfig.providerId || config.providerConfig.providerId === effectiveProvider) &&
      (!config.providerConfig.envKey || config.providerConfig.envKey === registryEntry?.envKey)
    ) {
      return config.providerConfig.baseUrl;
    }
    return getProviderOptions(effectiveProvider).baseUrl;
  }
  getModelForProvider(provider) {
    const providerName = provider ?? this.getActiveProviderName();
    const providerEntry = getProviderRegistryEntry(providerName);
    const isSupportedModel = model =>
      !model || providerName !== 'google-assist' || providerEntry.models.some(entry => entry.id === model);
    if (!provider && this.sessionModel) {
      return isSupportedModel(this.sessionModel) ? this.sessionModel : providerEntry.defaultModel;
    }
    const config = this.getSelectedProviderConfig();
    return isSupportedModel(config.model) ? config.model : providerEntry.defaultModel;
  }
  async createClient(provider, options = {}) {
    const effectiveProvider = provider ?? this.getActiveProviderName();
    const providerInstance = this.getProvider(effectiveProvider);
    if (effectiveProvider === 'anthropic') {
      const type = this.getAnthropicProviderType();
      // Clear all first to ensure only one is active
      delete process.env.CLEW_CODE_USE_BEDROCK;
      delete process.env.CLEW_CODE_USE_VERTEX;
      delete process.env.CLEW_CODE_USE_FOUNDRY;
      if (type === 'bedrock') process.env.CLEW_CODE_USE_BEDROCK = 'true';
      if (type === 'vertex') process.env.CLEW_CODE_USE_VERTEX = 'true';
      if (type === 'foundry') process.env.CLEW_CODE_USE_FOUNDRY = 'true';
    }
    if (effectiveProvider === 'google') {
      const config = this.getSelectedProviderConfig();
      const type = config.providerConfig?.googleType;
      if (type === 'vertex') {
        process.env.GOOGLE_USE_VERTEX = 'true';
      } else {
        delete process.env.GOOGLE_USE_VERTEX;
      }
    }
    if (effectiveProvider === 'openai') {
      const config = this.getSelectedProviderConfig();
      const type = config.providerConfig?.openaiType;
      if (type === 'azure') {
        process.env.OPENAI_USE_AZURE = 'true';
      } else {
        delete process.env.OPENAI_USE_AZURE;
      }
    }
    const apiKey = options.apiKey ?? this.getApiKeyForProvider(effectiveProvider);
    const baseUrl = options.baseUrl ?? this.getBaseUrlForProvider(effectiveProvider);
    const model = options.model ?? this.getModelForProvider(effectiveProvider);
    const config = this.getSelectedProviderConfig();
    const registryEntry = getProviderRegistryEntry(effectiveProvider);
    const isConfigValid =
      config.providerConfig &&
      (!config.providerConfig.providerId || config.providerConfig.providerId === effectiveProvider) &&
      (!config.providerConfig.envKey || config.providerConfig.envKey === registryEntry?.envKey);
    return providerInstance.createClient({
      ...(isConfigValid ? config.providerConfig : {}),
      ...options,
      apiKey,
      baseUrl,
      model,
    });
  }
  async listModels(provider, options = {}) {
    const effectiveProvider = provider ?? this.getActiveProviderName();
    const providerInstance = this.getProvider(effectiveProvider);
    const apiKey = options.apiKey ?? this.getApiKeyForProvider(effectiveProvider);
    const baseUrl = options.baseUrl ?? this.getBaseUrlForProvider(effectiveProvider);
    return providerInstance.listModels({
      ...options,
      apiKey,
      baseUrl,
    });
  }
}
