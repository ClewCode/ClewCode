import { getSettings_DEPRECATED } from '../../utils/settings/settings.js';
import { BraveProvider } from './providers/brave.js';
import { DuckDuckGoProvider } from './providers/duckduckgo.js';
import { SearXNGProvider } from './providers/searxng.js';
import { SerperProvider } from './providers/serper.js';
import { TavilyProvider } from './providers/tavily.js';
import type { SearchOptions, SearchProvider, SearchResponse } from './types.js';

const providers: Record<string, SearchProvider> = {
  tavily: new TavilyProvider(),
  brave: new BraveProvider(),
  serper: new SerperProvider(),
  searxng: new SearXNGProvider(),
  duckduckgo: new DuckDuckGoProvider(),
};

const SEARCH_PROVIDER_TIMEOUT_MS = 5_000;

export const SEARCH_PROVIDERS = Object.keys(providers);

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

export async function searchWithProvider(
  providerName: string,
  query: string,
  options?: SearchOptions,
): Promise<SearchResponse> {
  const provider = getSearchProvider(providerName);
  if (!provider) {
    throw new Error(`Unknown search provider: ${providerName}`);
  }

  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<SearchResponse>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`${provider.name} search timed out after ${SEARCH_PROVIDER_TIMEOUT_MS / 1000}s`));
    }, SEARCH_PROVIDER_TIMEOUT_MS);
    if (typeof timeout === 'object' && 'unref' in timeout) {
      timeout.unref();
    }
  });

  try {
    return await Promise.race([provider.search(query, options), timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
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

export type { SearchOptions, SearchProvider, SearchProviderConfig, SearchResponse, SearchResult } from './types.js';
