import { getConfiguredProviders, searchWithFallback } from '../../services/search/index.js';
import { logError } from '../../utils/log.js';
import { calculateSourceScore, type SourceScore } from './smartSourceRanking.js';

/**
 * Research-facing adapter over `src/services/search`. The provider transports
 * themselves (auth, timeouts, abort, 429 retry, provider fallback) live there;
 * this module only shapes results for the research pipeline.
 */
export type SearchProviderName = 'duckduckgo' | 'tavily' | 'brave' | 'serper' | 'jina';

export interface SearchProviderResult {
  source: SearchProviderName;
  query: string;
  results: Array<{
    title: string;
    url: string;
    content?: string;
    description?: string;
    excerpt: string;
    score?: SourceScore;
  }>;
  answer?: string;
  responseTime?: number;
}

/**
 * Providers to try, in order. Unlike the API-key-only default used by
 * WebSearch, research falls back to DuckDuckGo rather than returning nothing.
 */
export function getSearchProviderPriority(): SearchProviderName[] {
  return [...getConfiguredProviders(), 'duckduckgo'] as SearchProviderName[];
}

/**
 * Search the first provider that returns results, in priority order.
 *
 * Returns an array to keep the research pipeline's shape, but it holds at most
 * one entry: providers are tried in sequence and the first success wins, so a
 * configured-but-slow provider costs latency, not a failed search.
 */
export async function searchWithProviders(
  query: string,
  options: {
    providers?: SearchProviderName[];
    maxResults?: number;
    signal?: AbortSignal;
  } = {},
): Promise<SearchProviderResult[]> {
  const { providers, maxResults = 10, signal } = options;
  const startTime = performance.now();

  try {
    const response = await searchWithFallback(query, {
      num: maxResults,
      signal,
      providers: providers ?? getSearchProviderPriority(),
    });

    return [
      {
        source: response.provider as SearchProviderName,
        query: response.query,
        results: response.results.map(r => {
          const excerpt = r.snippet || '';
          return {
            title: r.title,
            url: r.url,
            content: excerpt,
            description: excerpt,
            excerpt,
            score: calculateSourceScore(r.url, r.title, excerpt),
          };
        }),
        answer: response.answer,
        responseTime: performance.now() - startTime,
      },
    ];
  } catch (error) {
    logError(error as Error);
    return [];
  }
}
