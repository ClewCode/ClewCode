import { getSettings_DEPRECATED } from '../../../utils/settings/settings.js';
import { rateLimitErrorFromResponse } from '../errors.js';
import type { SearchOptions, SearchProvider, SearchResponse, SearchResult } from '../types.js';

interface TavilySearchResponse {
  results?: Array<{
    title: string;
    url: string;
    content: string;
    score: number;
  }>;
  answer?: string;
}

export class TavilyProvider implements SearchProvider {
  name = 'tavily';
  description = 'AI-optimized search engine designed for LLMs';
  requiresApiKey = true;
  apiKeyEnvVar = 'TAVILY_API_KEY';
  baseUrl = 'https://api.tavily.com';
  supportsPagination = false;
  maxResultsPerPage = 10;
  rateLimit = 60;

  async search(query: string, options?: SearchOptions): Promise<SearchResponse> {
    const settings = getSettings_DEPRECATED();
    const apiKey = process.env.TAVILY_API_KEY || settings?.env?.TAVILY_API_KEY;
    if (!apiKey) {
      throw new Error('TAVILY_API_KEY not configured');
    }

    const num = options?.num || 10;

    const response = await fetch(`${this.baseUrl}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        max_results: num,
        include_answer: true,
        include_raw_content: false,
      }),
      signal: options?.signal,
    });

    if (response.status === 429) {
      throw rateLimitErrorFromResponse(this.name, response);
    }

    if (!response.ok) {
      throw new Error(`Tavily API error: ${response.status} ${response.statusText}`);
    }

    const data: TavilySearchResponse = await response.json();

    const results: SearchResult[] = (data.results || []).map(r => ({
      title: r.title,
      url: r.url,
      snippet: r.content.slice(0, 300),
      relevanceScore: r.score,
    }));

    return {
      results,
      query,
      provider: this.name,
      answer: data.answer,
    };
  }
}
