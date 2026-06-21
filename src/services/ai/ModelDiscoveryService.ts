/**
 * ModelDiscoveryService — queries live /v1/models endpoints from configured
 * providers and merges results into the static providers.json model catalog.
 *
 * Flow:
 * 1. Read configured API keys from env vars
 * 2. Query each provider's /models endpoint
 * 3. Parse, normalize, and cache results locally
 * 4. Provide enriched model list with context_window, pricing, capabilities
 *
 * Cache: ~/.claude/model-cache.json (TTL: 6 hours)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getGlobalConfig } from '../../utils/config.js';
import { logForDebugging } from '../../utils/debug.js';
import { getClewConfigHomeDir } from '../../utils/envUtils.js';
import { toError } from '../../utils/errors.js';
import { logError } from '../../utils/log.js';
import providersConfig from './providers.json' with { type: 'json' };

// ── Types ─────────────────────────────────────────────────────────────

export interface DiscoveredModel {
  id: string;
  label?: string;
  providerId: string;
  providerLabel: string;
  created?: number;
  owned_by?: string;
  contextLength?: number;
  maxOutputTokens?: number;
  inputModalities?: string[];
  outputModalities?: string[];
  supportsTools?: boolean;
  supportsVision?: boolean;
  streaming?: 'full' | 'partial' | 'none';
  reasoning?: boolean;
  pricing?: {
    prompt?: number;
    completion?: number;
    inputCacheRead?: number;
    image?: number;
  };
  tags?: string[];
  source: 'api' | 'cache' | 'static';
  fetchedAt?: number;
}

export interface DiscoveryResult {
  providerId: string;
  providerLabel: string;
  modelsUrl: string;
  models: DiscoveredModel[];
  error?: string;
  fetchedAt: number;
}

export interface ModelCache {
  version: number;
  updatedAt: number;
  providers: Record<string, DiscoveryResult>;
}

// ── Constants ─────────────────────────────────────────────────────────

const CACHE_PATH = join(getClewConfigHomeDir(), 'model-cache.json');
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const REQUEST_TIMEOUT_MS = 15000;

// ── Provider Discovery Configuration ──────────────────────────────────

interface ProviderDiscoveryConfig {
  providerId: string;
  envKey: string;
  modelsUrl: string;
  /** Authorization header prefix: "Bearer" or "x-api-key" etc */
  authHeader: string;
  /** Transform raw API response to DiscoveredModel[] */
  parseResponse: (data: any, providerId: string) => DiscoveredModel[];
}

/**
 * Build provider discovery configs from providers.json + known API patterns.
 */
function getDiscoveryConfigs(): ProviderDiscoveryConfig[] {
  const configs: ProviderDiscoveryConfig[] = [];

  for (const [key, provider] of Object.entries(providersConfig)) {
    const modelsUrl = (provider as any).modelsUrl;
    if (!modelsUrl) continue;

    configs.push({
      providerId: (provider as any).providerId,
      envKey: (provider as any).envKey,
      modelsUrl,
      authHeader: key === 'google' ? 'x-goog-api-key' : 'Bearer',
      parseResponse: getParser((provider as any).providerId),
    });
  }

  return configs;
}

// ── Response Parsers ──────────────────────────────────────────────────

function getParser(providerId: string): (data: any, pid: string) => DiscoveredModel[] {
  switch (providerId) {
    case 'openrouter':
      return parseOpenRouterResponse;
    case 'anthropic':
      return parseAnthropicResponse;
    case 'google':
      return parseGoogleResponse;
    default:
      // OpenAI-compatible: { object: "list", data: [{id, object, created, owned_by}] }
      return parseOpenAICompatibleResponse;
  }
}

function parseOpenRouterResponse(data: any, providerId: string): DiscoveredModel[] {
  if (!data?.data) return [];
  return data.data
    .filter((m: any) => m.architecture?.modality?.includes('text'))
    .map((m: any) => ({
      id: m.id,
      label: m.name,
      providerId,
      providerLabel: 'OpenRouter',
      contextLength: m.context_length,
      maxOutputTokens: m.top_provider?.max_completion_tokens,
      inputModalities: m.architecture?.input_modalities,
      outputModalities: m.architecture?.output_modalities,
      supportsTools: m.supported_parameters?.includes('tools'),
      supportsVision: m.architecture?.input_modalities?.includes('image'),
      pricing: m.pricing
        ? {
            prompt: parseFloat(m.pricing.prompt) || undefined,
            completion: parseFloat(m.pricing.completion) || undefined,
            inputCacheRead: parseFloat(m.pricing.input_cache_read) || undefined,
          }
        : undefined,
      streaming: 'full',
      reasoning: m.supported_parameters?.includes('reasoning'),
      source: 'api',
    }));
}

function parseAnthropicResponse(data: any, providerId: string): DiscoveredModel[] {
  if (!data?.data) return [];
  return data.data.map((m: any) => ({
    id: m.id,
    label: m.display_name,
    providerId,
    providerLabel: 'Anthropic',
    created: new Date(m.created_at).getTime(),
    contextLength: m.capabilities?.max_input_tokens,
    maxOutputTokens: m.capabilities?.max_tokens,
    supportsTools: m.capabilities?.tool_use,
    supportsVision: m.capabilities?.vision,
    streaming: 'full',
    reasoning: m.capabilities?.reasoning,
    source: 'api',
  }));
}

function parseGoogleResponse(data: any, providerId: string): DiscoveredModel[] {
  if (!data?.models) return [];
  return data.models
    .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m: any) => ({
      id: m.name?.replace('models/', ''),
      label: m.displayName,
      providerId,
      providerLabel: 'Google',
      contextLength: (m as any).inputTokenLimit || (m as any).contextWindow,
      maxOutputTokens: (m as any).outputTokenLimit || (m as any).maxOutputTokens,
      inputModalities:
        m.inputModalities || (m.supportedGenerationMethods?.includes('generateContent') ? ['text'] : undefined),
      supportsTools: m.supportedGenerationMethods?.includes('generateContent'),
      supportsVision: m.inputModalities?.includes('image'),
      streaming: 'partial',
      source: 'api',
    }));
}

function parseOpenAICompatibleResponse(data: any, providerId: string): DiscoveredModel[] {
  // Support both { data: [...] } (OpenAI) and { object: "list", data: [...] } variants
  const models = data?.data || (Array.isArray(data) ? data : []);
  if (!Array.isArray(models)) return [];

  return models
    .filter(
      (m: any) =>
        m.id &&
        !m.id.includes('embed') &&
        !m.id.includes('whisper') &&
        !m.id.includes('tts') &&
        !m.id.includes('dall-e') &&
        !m.id.includes('moderation'),
    )
    .map((m: any) => ({
      id: m.id,
      label: m.id,
      providerId,
      providerLabel: providerId,
      created: m.created,
      owned_by: m.owned_by,
      supportsTools: m.capabilities?.supports?.tool_calls ?? m.capabilities?.toolCalling,
      supportsVision: m.capabilities?.supports?.vision ?? m.capabilities?.vision,
      streaming: 'full',
      source: 'api' as const,
    }));
}

// ── Core Service ──────────────────────────────────────────────────────

export class ModelDiscoveryService {
  private static instance: ModelDiscoveryService;
  private cache: ModelCache | null = null;
  private fetching = new Map<string, Promise<DiscoveryResult>>();

  static getInstance(): ModelDiscoveryService {
    if (!ModelDiscoveryService.instance) {
      ModelDiscoveryService.instance = new ModelDiscoveryService();
    }
    return ModelDiscoveryService.instance;
  }

  /** Load cache from disk */
  private loadCache(): ModelCache | null {
    if (this.cache) return this.cache;
    try {
      if (existsSync(CACHE_PATH)) {
        const raw = readFileSync(CACHE_PATH, 'utf-8');
        this.cache = JSON.parse(raw) as ModelCache;
        return this.cache;
      }
    } catch {
      return null;
    }
    return null;
  }

  /** Save cache to disk */
  private saveCache(): void {
    try {
      const dir = getClewConfigHomeDir();
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(CACHE_PATH, JSON.stringify(this.cache, null, 2));
    } catch (err) {
      logError(toError(err));
    }
  }

  /** Check if cache is still valid */
  isCacheValid(): boolean {
    const cache = this.loadCache();
    if (!cache) return false;
    return Date.now() - cache.updatedAt < CACHE_TTL_MS;
  }

  /** Get cached models for a specific provider */
  getCachedModels(providerId: string): DiscoveryResult | null {
    const cache = this.loadCache();
    return cache?.providers?.[providerId] ?? null;
  }

  /** Get all cached models across providers */
  getAllCachedModels(): DiscoveryResult[] {
    const cache = this.loadCache();
    if (!cache) return [];
    return Object.values(cache.providers);
  }

  /** Get merged enriched model list (API + static) */
  getEnrichedModels(providerId: string): DiscoveredModel[] {
    const cached = this.getCachedModels(providerId);
    if (cached?.models?.length) return cached.models;

    // Fall back to static providers.json
    const staticModels = (providersConfig as any)[providerId]?.models || [];
    return staticModels.map((m: any) => ({
      id: m.id,
      label: m.label || m.id,
      providerId,
      providerLabel: (providersConfig as any)[providerId]?.label || providerId,
      contextLength: m.capabilities?.maxContext,
      maxOutputTokens: m.capabilities?.maxOutput,
      supportsTools: m.capabilities?.toolCalling !== 'none',
      supportsVision: m.capabilities?.vision,
      streaming: m.capabilities?.streaming || 'full',
      reasoning: m.capabilities?.reasoning,
      tags: m.tags,
      source: 'static' as const,
    }));
  }

  /** Query a single provider's models endpoint */
  async fetchProviderModels(providerId: string): Promise<DiscoveryResult> {
    // Deduplicate concurrent fetches
    if (this.fetching.has(providerId)) return this.fetching.get(providerId)!;

    const configs = getDiscoveryConfigs();
    const config = configs.find(c => c.providerId === providerId);
    if (!config) throw new Error(`No discovery config for provider: ${providerId}`);

    const promise = this.doFetch(config);
    this.fetching.set(providerId, promise);

    try {
      return await promise;
    } finally {
      this.fetching.delete(providerId);
    }
  }

  private async doFetch(config: ProviderDiscoveryConfig): Promise<DiscoveryResult> {
    let apiKey = process.env[config.envKey];

    // If google provider and no GEMINI_API_KEY, check if googleType === 'subscriber' and use OAuth token
    if (config.providerId === 'google' && !apiKey) {
      const globalConfig = getGlobalConfig() as any;
      if (process.env.GOOGLE_OAUTH_TOKEN) {
        apiKey = process.env.GOOGLE_OAUTH_TOKEN;
      } else if (globalConfig?.googleOAuthTokens?.accessToken) {
        apiKey = globalConfig.googleOAuthTokens.accessToken;
      }
    }

    const result: DiscoveryResult = {
      providerId: config.providerId,
      providerLabel: (providersConfig as any)[config.providerId]?.label || config.providerId,
      modelsUrl: config.modelsUrl,
      models: [],
      fetchedAt: Date.now(),
    };

    // Skip if no API key (except for Ollama — local)
    if (!apiKey && config.providerId !== 'ollama') {
      result.error = `No API key configured (${config.envKey})`;
      return result;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      let url = config.modelsUrl;
      const headers: Record<string, string> = {};

      if (config.providerId === 'google') {
        if (apiKey?.startsWith('ya29.')) {
          // Google OAuth token - use standard Bearer Authorization header instead of ?key= parameter
          headers['Authorization'] = `Bearer ${apiKey}`;
        } else {
          // Standard API key - use ?key= param
          url = `${config.modelsUrl}?key=${apiKey}`;
        }
      } else if (config.providerId === 'ollama') {
        // Ollama — no auth needed
      } else {
        headers['Authorization'] = `${config.authHeader} ${apiKey}`;
      }
      headers['Content-Type'] = 'application/json';

      const response = await fetch(url, {
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        result.error = `HTTP ${response.status}: ${response.statusText}`;
        logForDebugging(`ModelDiscovery: ${config.providerId} returned ${response.status}`);
        return result;
      }

      const data = await response.json();
      const models = config.parseResponse(data, config.providerId);

      // Enrich with provider label
      result.models = models.map(m => ({
        ...m,
        providerLabel: result.providerLabel,
        fetchedAt: result.fetchedAt,
      }));

      logForDebugging(`ModelDiscovery: ${config.providerId} => ${result.models.length} models`);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        result.error = 'Request timed out';
      } else {
        result.error = err.message;
      }
      logForDebugging(`ModelDiscovery: ${config.providerId} error: ${result.error}`);
    }

    // Update cache
    if (!this.cache) this.cache = { version: 1, updatedAt: Date.now(), providers: {} };
    this.cache.providers[config.providerId] = result;
    this.cache.updatedAt = Date.now();
    this.saveCache();

    return result;
  }

  /** Fetch all configured providers in parallel */
  async fetchAllProviders(): Promise<DiscoveryResult[]> {
    const configs = getDiscoveryConfigs();
    const results: DiscoveryResult[] = [];

    // Fetch in batches of 5 to avoid rate limits
    const batchSize = 5;
    for (let i = 0; i < configs.length; i += batchSize) {
      const batch = configs.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(batch.map(c => this.fetchProviderModels(c.providerId)));
      for (const r of batchResults) {
        if (r.status === 'fulfilled') results.push(r.value);
        else {
          logError(toError(r.reason));
          results.push({
            providerId: 'unknown',
            providerLabel: 'Unknown',
            modelsUrl: '',
            models: [],
            error: r.reason?.message || 'Unknown error',
            fetchedAt: Date.now(),
          });
        }
      }
    }

    return results;
  }

  /** Check which providers have configured API keys */
  getConfiguredProviders(): string[] {
    const configs = getDiscoveryConfigs();
    return configs.filter(c => process.env[c.envKey]).map(c => c.providerId);
  }

  /** Get cache age in a human-readable format */
  getCacheAge(): string | null {
    const cache = this.loadCache();
    if (!cache) return null;
    const ageMs = Date.now() - cache.updatedAt;
    const minutes = Math.floor(ageMs / 60000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m ago`;
  }

  /** Invalidate cache for a specific provider or all */
  async refreshProvider(providerId: string): Promise<DiscoveryResult> {
    // Clear from cache
    if (this.cache?.providers) {
      delete this.cache.providers[providerId];
      this.saveCache();
    }
    // Re-fetch
    return this.fetchProviderModels(providerId);
  }

  async refreshAll(): Promise<DiscoveryResult[]> {
    this.cache = { version: 1, updatedAt: Date.now(), providers: {} };
    this.saveCache();
    return this.fetchAllProviders();
  }
}

// Re-export providers config for convenience
export { providersConfig };
