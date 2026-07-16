import { getSettings_DEPRECATED } from '../../../utils/settings/settings.js';
import { rateLimitErrorFromResponse } from '../errors.js';
import type { SearchOptions, SearchProvider, SearchResponse, SearchResult } from '../types.js';

interface JinaSearchResponse {
  data?: Array<{
    title?: string;
    url?: string;
    content?: string;
    description?: string;
  }>;
}

export class JinaProvider implements SearchProvider {
  name = 'jina';
  description = 'Jina Reader search with full page content';
  requiresApiKey = true;
  apiKeyEnvVar = 'JINA_API_KEY';
  baseUrl = 'https://s.jina.ai';
  supportsPagination = false;
  maxResultsPerPage = 10;

  async search(query: string, options?: SearchOptions): Promise<SearchResponse> {
    const settings = getSettings_DEPRECATED();
    const apiKey = process.env.JINA_API_KEY || settings?.env?.JINA_API_KEY;
    if (!apiKey) {
      throw new Error('JINA_API_KEY not configured');
    }

    const num = Math.min(options?.num || 10, this.maxResultsPerPage);

    const response = await fetch(`${this.baseUrl}/${encodeURIComponent(query)}`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: options?.signal,
    });

    if (response.status === 429) {
      throw rateLimitErrorFromResponse(this.name, response);
    }

    if (!response.ok) {
      throw new Error(`Jina Search error: ${response.status} ${response.statusText}`);
    }

    const data: JinaSearchResponse = await response.json();

    const results: SearchResult[] = (data.data || [])
      .filter(r => r.title && r.url)
      .slice(0, num)
      .map(r => ({
        title: r.title as string,
        url: r.url as string,
        snippet: r.description || r.content || '',
      }));

    return {
      results,
      query,
      provider: this.name,
    };
  }
}
