import { getSettings_DEPRECATED } from '../../../utils/settings/settings.js';
import { rateLimitErrorFromResponse } from '../errors.js';
import type { SearchOptions, SearchProvider, SearchResponse, SearchResult } from '../types.js';

interface SerperSearchResponse {
  searchParameters: {
    q: string;
    num: number;
  };
  organic: Array<{
    title: string;
    link: string;
    snippet: string;
    rank: number;
  }>;
  creditsUsed?: number;
  creditsRemaining?: number;
}

export class SerperProvider implements SearchProvider {
  name = 'serper';
  description = 'Google Search API via Serper';
  requiresApiKey = true;
  apiKeyEnvVar = 'SERPER_API_KEY';
  baseUrl = 'https://google.serper.dev/search';
  supportsPagination = true;
  maxResultsPerPage = 10;
  rateLimit = 2500; // 2500 requests/month on free tier

  async search(query: string, options?: SearchOptions): Promise<SearchResponse> {
    const settings = getSettings_DEPRECATED();
    const apiKey = process.env.SERPER_API_KEY || settings?.env?.SERPER_API_KEY;
    if (!apiKey) {
      throw new Error('SERPER_API_KEY not configured');
    }

    const num = Math.min(options?.num || 10, this.maxResultsPerPage);
    const start = options?.start || 0;

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey,
      },
      body: JSON.stringify({
        q: query,
        num: num,
        start: start,
        type: 'search',
      }),
      signal: options?.signal,
    });

    if (response.status === 429) {
      throw rateLimitErrorFromResponse(this.name, response);
    }

    if (!response.ok) {
      throw new Error(`Serper API error: ${response.status} ${response.statusText}`);
    }

    const data: SerperSearchResponse = await response.json();

    const results: SearchResult[] = (data.organic || []).map(r => ({
      title: r.title,
      url: r.link,
      snippet: r.snippet,
    }));

    return {
      results,
      query,
      provider: this.name,
      creditsLeft: data.creditsRemaining,
    };
  }
}
