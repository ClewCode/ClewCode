import { getSettings_DEPRECATED } from '../../utils/settings/settings.js';
import { SearchRateLimitError, SearchTimeoutError } from './errors.js';
import { BraveProvider } from './providers/brave.js';
import { DuckDuckGoProvider } from './providers/duckduckgo.js';
import { JinaProvider } from './providers/jina.js';
import { SerperProvider } from './providers/serper.js';
import { TavilyProvider } from './providers/tavily.js';
import type { SearchOptions, SearchProvider, SearchResponse } from './types.js';

const providers: Record<string, SearchProvider> = {
  tavily: new TavilyProvider(),
  brave: new BraveProvider(),
  serper: new SerperProvider(),
  jina: new JinaProvider(),
  duckduckgo: new DuckDuckGoProvider(),
};

// Tavily's own docs use a 20s client timeout for default search_depth, and
// offer a separate "ultra-fast" depth for latency-sensitive callers — so a
// multi-second response is expected, not a fault.
const SEARCH_PROVIDER_TIMEOUT_MS = 20_000;
const RATE_LIMIT_MAX_RETRIES = 2;
const RATE_LIMIT_MAX_WAIT_MS = 10_000;

export const SEARCH_PROVIDERS = Object.keys(providers);

/**
 * Preference order for API-key providers. DuckDuckGo is deliberately absent:
 * its scraped results are too poor to use unless a caller explicitly opts in
 * (see `searchWithFallback`'s `providers` option).
 */
export const DEFAULT_PROVIDER_PRIORITY = ['tavily', 'brave', 'serper', 'jina'] as const;

export function getSearchProvider(name: string): SearchProvider | null {
  return providers[name.toLowerCase()] || null;
}

export function isProviderConfigured(name: string): boolean {
  const provider = providers[name.toLowerCase()];
  if (!provider) return false;
  if (!provider.requiresApiKey) return true;

  const settings = getSettings_DEPRECATED();
  const envVar = provider.apiKeyEnvVar;
  return envVar ? !!(process.env[envVar] || settings?.env?.[envVar]) : false;
}

/** Configured providers in preference order. */
export function getConfiguredProviders(): string[] {
  return DEFAULT_PROVIDER_PRIORITY.filter(isProviderConfigured);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason ?? new Error('aborted'));
      },
      { once: true },
    );
  });
}

async function searchOnce(provider: SearchProvider, query: string, options?: SearchOptions): Promise<SearchResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_PROVIDER_TIMEOUT_MS);
  const callerSignal = options?.signal;
  const forwardAbort = () => controller.abort();
  callerSignal?.addEventListener('abort', forwardAbort, { once: true });

  try {
    return await provider.search(query, { ...options, signal: controller.signal });
  } catch (err) {
    // Distinguish our timeout from a caller-initiated cancellation: only the
    // former should be reported (and retried against) as a provider fault.
    if (controller.signal.aborted && !callerSignal?.aborted) {
      throw new SearchTimeoutError(provider.name, SEARCH_PROVIDER_TIMEOUT_MS);
    }
    throw err;
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort', forwardAbort);
  }
}

export async function searchWithProvider(
  providerName: string,
  query: string,
  options?: SearchOptions,
): Promise<SearchResponse> {
  const provider = getSearchProvider(providerName);
  if (!provider) {
    throw new Error(`Unknown search provider: ${providerName}`);
  }

  for (let attempt = 0; ; attempt++) {
    try {
      return await searchOnce(provider, query, options);
    } catch (err) {
      const canRetry = err instanceof SearchRateLimitError && attempt < RATE_LIMIT_MAX_RETRIES;
      if (!canRetry) throw err;

      const hintedMs = (err as SearchRateLimitError).retryAfterMs ?? 1_000;
      await sleep(Math.min(hintedMs, RATE_LIMIT_MAX_WAIT_MS), options?.signal);
    }
  }
}

/**
 * Try each configured provider in order until one returns results. A single
 * provider being slow, rate limited, or down must not sink the whole search
 * when another one is configured and healthy.
 */
export async function searchWithFallback(
  query: string,
  options?: SearchOptions & { providers?: string[] },
  onProviderAttempt?: (providerName: string) => void,
): Promise<SearchResponse> {
  const candidates = options?.providers ?? getConfiguredProviders();
  if (candidates.length === 0) {
    throw new Error(
      'No web search provider API keys are configured. Please set TAVILY_API_KEY, BRAVE_API_KEY, or SERPER_API_KEY in settings.',
    );
  }

  const failures: string[] = [];

  for (const name of candidates) {
    if (options?.signal?.aborted) break;
    onProviderAttempt?.(name);
    try {
      const response = await searchWithProvider(name, query, options);
      if (response.results.length > 0) return response;
      failures.push(`${name}: no results`);
    } catch (err) {
      failures.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  throw new Error(`All search providers failed — ${failures.join('; ')}`);
}

export function getAvailableProviders(): Array<{ name: string; description: string; configured: boolean }> {
  return SEARCH_PROVIDERS.map(name => {
    const provider = providers[name];
    return {
      name,
      description: provider.description,
      configured: isProviderConfigured(name),
    };
  });
}

export { SearchRateLimitError, SearchTimeoutError } from './errors.js';
export type { SearchOptions, SearchProvider, SearchProviderConfig, SearchResponse, SearchResult } from './types.js';
