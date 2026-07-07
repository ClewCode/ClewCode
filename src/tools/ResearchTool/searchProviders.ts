import { ofetch } from 'ofetch';
import { logError } from '../../utils/log.js';
import { calculateSourceScore, type SourceScore } from './smartSourceRanking.js';

// DuckDuckGo Integration (Free, no API key)
// Docs: https://duckduckgo.com/
export interface DDGSearchResult {
  title: string;
  url: string;
  description: string;
  score?: SourceScore;
}

export interface DDGSearchResponse {
  query: string;
  results: DDGSearchResult[];
  response_time: number;
}

export async function searchDuckDuckGo(
  query: string,
  options: {
    maxResults?: number;
    timeout?: number;
  } = {},
): Promise<DDGSearchResponse | null> {
  const { maxResults = 10, timeout = 10000 } = options;

  try {
    const startTime = performance.now();
    const url = new URL('https://api.duckduckgo.com/');
    url.searchParams.append('q', query);
    url.searchParams.append('format', 'json');
    url.searchParams.append('no_html', '1');
    url.searchParams.append('no_redirect', '1');

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'ClaudeCodeResearchTool/1.0',
      },
      signal: AbortSignal.timeout(timeout),
    });

    if (!response.ok) {
      throw new Error(`DuckDuckGo error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as any;
    const topics = Array.isArray(data.RelatedTopics) ? data.RelatedTopics : [];

    const flattenedTopics = topics.flatMap((item: any) => {
      if (Array.isArray(item.Topics)) return item.Topics;
      return [item];
    });

    const results = flattenedTopics
      .filter((r: any) => r.FirstURL && r.Text)
      .slice(0, maxResults)
      .map((r: any) => {
        const title = r.Text.split(' - ')[0] || r.Text;
        const url = r.FirstURL;
        const excerpt = r.Text;
        return {
          title,
          url,
          description: r.Text,
          excerpt,
          score: calculateSourceScore(url, title, excerpt),
        };
      });

    return {
      query,
      results,
      response_time: performance.now() - startTime,
    };
  } catch (error) {
    logError(error as Error);
    return null;
  }
}

// Tavily API Integration
// Docs: https://docs.tavily.com/docs/tavily-api/introduction
const TAVILY_API_BASE = 'https://api.tavily.com';

export interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number; // API provided score
  raw_content?: string;
  sourceScore?: SourceScore; // Our smart score
}

export interface TavilySearchResponse {
  query: string;
  results: TavilySearchResult[];
  answer?: string;
  images?: string[];
  response_time: number;
}

export async function searchTavily(
  query: string,
  options: {
    searchDepth?: 'basic' | 'advanced';
    maxResults?: number;
    includeAnswer?: boolean;
    includeImages?: boolean;
  } = {},
): Promise<TavilySearchResponse | null> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return null;
  }

  const { searchDepth = 'basic', maxResults = 5, includeAnswer = true, includeImages = false } = options;

  try {
    const response = await ofetch(
      `${TAVILY_API_BASE}/search`,
      {
        api_key: apiKey,
        query,
        search_depth: searchDepth,
        max_results: maxResults,
        include_answer: includeAnswer,
        include_images: includeImages,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      },
    );

    const data = response.data as TavilySearchResponse;
    // Attach our smart scores to Tavily results
    data.results = data.results.map(r => ({
      ...r,
      sourceScore: calculateSourceScore(r.url, r.title, r.content),
    }));

    return data;
  } catch (error) {
    logError(error as Error);
    return null;
  }
}

// Brave Search API Integration
// Docs: https://api.search.brave.com/
const BRAVE_API_BASE = 'https://api.search.brave.com/res/v1';

export interface BraveSearchResult {
  title: string;
  url: string;
  description: string;
  age?: string;
  is_source_local?: boolean;
  is_source_both?: boolean;
  favicon?: string;
  score?: SourceScore;
}

export interface BraveSearchResponse {
  query: string;
  results: BraveSearchResult[];
  type: 'brave';
}

export async function searchBrave(
  query: string,
  options: {
    count?: number;
    offset?: number;
  } = {},
): Promise<BraveSearchResponse | null> {
  const apiKey = process.env.BRAVE_API_KEY;
  if (!apiKey) {
    return null;
  }

  const { count = 10, offset = 0 } = options;

  try {
    const response = await ofetch(`${BRAVE_API_BASE}/web/search`, {
      params: {
        q: query,
        count,
        offset,
      },
      headers: {
        'X-Subscription-Token': apiKey,
        Accept: 'application/json',
      },
      timeout: 30000,
    });

    const data = response.data;
    const webResults = data.web?.results || [];

    return {
      query,
      type: 'brave',
      results: webResults.map((r: any) => {
        const title = r.title;
        const url = r.url;
        const excerpt = r.description;
        return {
          title,
          url,
          description: excerpt,
          age: r.age,
          is_source_local: r.is_source_local,
          is_source_both: r.is_source_both,
          favicon: r.favicon,
          score: calculateSourceScore(url, title, excerpt),
        };
      }),
    };
  } catch (error) {
    logError(error as Error);
    return null;
  }
}

// Jina Search Integration (Free, no API key, high quality)
export interface JinaSearchResult {
  title: string;
  url: string;
  content: string;
  description: string;
  score?: SourceScore;
}

export interface JinaSearchResponse {
  query: string;
  results: JinaSearchResult[];
  response_time?: number;
}

export async function searchJina(
  query: string,
  options: {
    maxResults?: number;
    timeout?: number;
  } = {},
): Promise<JinaSearchResponse | null> {
  const apiKey = process.env.JINA_API_KEY;
  if (!apiKey) {
    return null;
  }

  const { maxResults = 10, timeout = 15000 } = options;

  try {
    const startTime = performance.now();
    const response = await fetch(`https://s.jina.ai/${encodeURIComponent(query)}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'ClewCodeResearchTool/1.0',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(timeout),
    });

    if (!response.ok) {
      throw new Error(`Jina Search error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as any;
    const items = Array.isArray(data.data) ? data.data : [];

    const results = items
      .filter((r: any) => r.title && r.url)
      .slice(0, maxResults)
      .map((r: any) => ({
        title: r.title,
        url: r.url,
        content: r.content || '',
        description: r.description || '',
        score: calculateSourceScore(r.url, r.title, r.description || ''),
      }));

    return {
      query,
      results,
      response_time: performance.now() - startTime,
    };
  } catch (error) {
    logError(error as Error);
    return null;
  }
}

// Unified search function that tries multiple providers in priority order
export interface SearchProviderResult {
  source: 'duckduckgo' | 'tavily' | 'brave' | 'jina';
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
 * Get search providers in priority order:
 * 1. Tavily (if API key available)
 * 2. Brave (if API key available)
 * 3. Jina (if API key available)
 * 4. DuckDuckGo (free, no API key, last resort)
 */
export function getSearchProviderPriority(): Array<'duckduckgo' | 'tavily' | 'brave' | 'jina'> {
  const providers: Array<'duckduckgo' | 'tavily' | 'brave' | 'jina'> = [];

  // API-based providers (if configured) first
  if (process.env.TAVILY_API_KEY) {
    providers.push('tavily');
  }

  if (process.env.BRAVE_API_KEY) {
    providers.push('brave');
  }

  if (process.env.JINA_API_KEY) {
    providers.push('jina');
  }

  // DuckDuckGo as final free fallback
  providers.push('duckduckgo');

  return providers;
}

export async function searchWithProviders(
  query: string,
  options: {
    providers?: Array<'duckduckgo' | 'tavily' | 'brave' | 'jina'>;
    maxResults?: number;
    timeout?: number;
  } = {},
): Promise<SearchProviderResult[]> {
  const { providers, maxResults = 10, timeout = 10000 } = options;
  const providersToUse = providers || getSearchProviderPriority();

  // Run all provider searches in parallel for maximum speed
  const searchPromises = providersToUse.map(async (provider): Promise<SearchProviderResult | null> => {
    try {
      if (provider === 'duckduckgo') {
        const ddgResult = await searchDuckDuckGo(query, {
          maxResults,
          timeout,
        });

        if (ddgResult && ddgResult.results.length > 0) {
          return {
            source: 'duckduckgo',
            query: ddgResult.query,
            results: ddgResult.results.map(r => ({
              title: r.title,
              url: r.url,
              description: r.description || '',
              excerpt: (r.description || '').substring(0, 500),
            })),
            responseTime: ddgResult.response_time,
          };
        }
      }

      if (provider === 'tavily') {
        const tavilyResult = await searchTavily(query, {
          searchDepth: 'advanced',
          maxResults: 5,
          includeAnswer: true,
        });

        if (tavilyResult && tavilyResult.results.length > 0) {
          return {
            source: 'tavily',
            query: tavilyResult.query,
            results: tavilyResult.results.map(r => ({
              title: r.title,
              url: r.url,
              content: r.content || '',
              excerpt: `${(r.content || '').substring(0, 200)}...`,
            })),
            answer: tavilyResult.answer,
            responseTime: tavilyResult.response_time,
          };
        }
      }

      if (provider === 'brave') {
        const braveResult = await searchBrave(query, { count: 10 });

        if (braveResult && braveResult.results.length > 0) {
          return {
            source: 'brave',
            query: braveResult.query,
            results: braveResult.results.map(r => ({
              title: r.title,
              url: r.url,
              description: r.description,
              excerpt: r.description || '',
            })),
            responseTime: undefined,
          };
        }
      }

      if (provider === 'jina') {
        const jinaResult = await searchJina(query, {
          maxResults,
          timeout,
        });

        if (jinaResult && jinaResult.results.length > 0) {
          return {
            source: 'jina',
            query: jinaResult.query,
            results: jinaResult.results.map(r => ({
              title: r.title,
              url: r.url,
              content: r.content,
              description: r.description || '',
              excerpt: (r.description || r.content || '').substring(0, 500),
            })),
            responseTime: jinaResult.response_time,
          };
        }
      }
    } catch (error) {
      logError(error as Error);
    }
    return null;
  });

  // Wait for all searches to complete (parallel execution)
  const results = await Promise.all(searchPromises);

  // Filter out null results (failed searches)
  return results.filter((r): r is SearchProviderResult => r !== null);
}

// Check which providers are available
export function getAvailableSearchProviders(): Array<'duckduckgo' | 'tavily' | 'brave' | 'jina'> {
  const providers: Array<'duckduckgo' | 'tavily' | 'brave' | 'jina'> = [];

  // DuckDuckGo is always available (free)
  providers.push('duckduckgo');

  if (process.env.JINA_API_KEY) {
    providers.push('jina');
  }

  if (process.env.TAVILY_API_KEY) {
    providers.push('tavily');
  }

  if (process.env.BRAVE_API_KEY) {
    providers.push('brave');
  }

  return providers;
}
