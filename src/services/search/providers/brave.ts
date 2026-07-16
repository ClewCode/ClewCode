import { getSettings_DEPRECATED } from '../../../utils/settings/settings.js';
import { rateLimitErrorFromResponse } from '../errors.js';
import type { SearchOptions, SearchProvider, SearchResponse, SearchResult } from '../types.js';

interface BraveWebSearchResponse {
  web: {
    results: Array<{
      title: string;
      url: string;
      description: string;
    }>;
  };
}

export class BraveProvider implements SearchProvider {
  name = 'brave';
  description = 'Privacy-focused search engine with free tier';
  requiresApiKey = true;
  apiKeyEnvVar = 'BRAVE_API_KEY';
  baseUrl = 'https://api.search.brave.com/res/v1/web/search';
  supportsPagination = true;
  maxResultsPerPage = 20;
  rateLimit = 2000; // 2000 requests/day on free tier

  async search(query: string, options?: SearchOptions): Promise<SearchResponse> {
    const settings = getSettings_DEPRECATED();
    const apiKey = process.env.BRAVE_API_KEY || settings?.env?.BRAVE_API_KEY;
    if (!apiKey) {
      throw new Error('BRAVE_API_KEY not configured');
    }

    const num = Math.min(options?.num || 10, this.maxResultsPerPage);
    const offset = options?.start || 0;

    const url = new URL(this.baseUrl);
    url.searchParams.set('q', query);
    url.searchParams.set('count', String(num));
    if (offset > 0) {
      url.searchParams.set('offset', String(offset));
    }
    if (options?.language) {
      url.searchParams.set('lang', options.language);
    }

    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': apiKey,
      },
      signal: options?.signal,
    });

    if (response.status === 429) {
      throw rateLimitErrorFromResponse(this.name, response);
    }

    if (!response.ok) {
      throw new Error(`Brave Search API error: ${response.status} ${response.statusText}`);
    }

    const data: BraveWebSearchResponse = await response.json();

    const results: SearchResult[] = (data.web?.results || []).map(r => ({
      title: r.title,
      url: r.url,
      snippet: r.description,
    }));

    return {
      results,
      query,
      provider: this.name,
    };
  }
}
