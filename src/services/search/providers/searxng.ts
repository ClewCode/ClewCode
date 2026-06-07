import { getSettings_DEPRECATED } from '../../../utils/settings/settings.js';
import type { SearchOptions, SearchProvider, SearchResponse, SearchResult } from '../types.js';

interface SearXNGResponse {
  query: string;
  results: Array<{
    title: string;
    url: string;
    content: string;
    engine?: string;
  }>;
  answers: string[];
  infoboxes: Array<{
    infobox: string;
    content?: string;
    url?: string;
  }>;
  suggestions: string[];
}

const DEFAULT_INSTANCE = 'https://searx.be';

export class SearXNGProvider implements SearchProvider {
  name = 'searxng';
  description = 'Free, privacy-respecting metasearch engine (SearXNG)';
  requiresApiKey = false;
  supportsPagination = true;
  maxResultsPerPage = 50;
  rateLimit = undefined;

  private getBaseUrl(): string {
    const settings = getSettings_DEPRECATED();
    return process.env.SEARXNG_INSTANCE_URL || settings?.env?.SEARXNG_INSTANCE_URL || DEFAULT_INSTANCE;
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResponse> {
    const num = Math.min(options?.num || 10, this.maxResultsPerPage);

    const baseUrl = this.getBaseUrl();
    const url = new URL(`${baseUrl.replace(/\/+$/, '')}/search`);
    url.searchParams.set('format', 'json');
    url.searchParams.set('q', query);
    url.searchParams.set('language', options?.language || 'en');
    url.searchParams.set('pageno', String((options?.start || 0) + 1));
    url.searchParams.set('categories', 'general');

    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'ClaudeCode/2.1.145 (AI coding assistant; +https://github.com/ClewCode/ClewCode)',
      },
    });

    if (!response.ok) {
      throw new Error(`SearXNG search error: ${response.status} ${response.statusText}`);
    }

    const data: SearXNGResponse = await response.json();

    const results: SearchResult[] = (data.results || []).slice(0, num).map(r => ({
      title: r.title,
      url: r.url,
      snippet: r.content,
    }));

    return {
      results,
      totalResults: results.length,
      query,
      provider: this.name,
    };
  }
}
