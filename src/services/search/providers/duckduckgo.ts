import type { SearchOptions, SearchProvider, SearchResponse, SearchResult } from '../types.js';

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeDuckDuckGoUrl(value: string): string {
  const decoded = decodeHtmlEntities(value);
  const absolute = decoded.startsWith('//') ? `https:${decoded}` : decoded;
  try {
    const parsed = new URL(absolute);
    const uddg = parsed.searchParams.get('uddg');
    return uddg ? decodeURIComponent(uddg) : absolute;
  } catch {
    return absolute;
  }
}

function parseHtmlResults(html: string, num: number): SearchResult[] {
  const results: SearchResult[] = [];
  const blocks = html.split(/<div class="result results_links[^"]*">|<tr[^>]*>/);

  for (const block of blocks) {
    const linkMatch =
      block.match(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/) ||
      block.match(/<a[^>]+class='result-link'[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!linkMatch) continue;

    const url = normalizeDuckDuckGoUrl(linkMatch[1] ?? '');
    const title = stripHtml(linkMatch[2] ?? '');
    if (!url || !title) continue;

    const snippetMatch =
      block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/) ||
      block.match(/class='result-snippet'[^>]*>([\s\S]*?)<\/td>/);
    const snippet = snippetMatch ? stripHtml(snippetMatch[1] ?? '') : '';

    results.push({ title, url, snippet });
    if (results.length >= num) break;
  }

  return results;
}

export class DuckDuckGoProvider implements SearchProvider {
  name = 'duckduckgo';
  description = 'Free web search, no API key required';
  requiresApiKey = false;
  baseUrl = 'https://html.duckduckgo.com/html/';
  supportsPagination = false;
  maxResultsPerPage = 10;
  rateLimit = undefined; // No strict rate limit but be reasonable

  async search(query: string, options?: SearchOptions): Promise<SearchResponse> {
    const num = Math.min(options?.num || 10, this.maxResultsPerPage);

    const url = new URL(this.baseUrl);
    url.searchParams.set('q', query);

    const response = await fetch(url.toString(), {
      headers: {
        accept: 'text/html',
        'user-agent': 'Mozilla/5.0',
      },
      signal: options?.signal,
    });

    if (!response.ok) {
      throw new Error(`DuckDuckGo search error: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    const htmlResults = parseHtmlResults(html, num);
    if (htmlResults.length > 0) {
      return {
        results: htmlResults,
        query,
        provider: this.name,
      };
    }

    const instantAnswerUrl = new URL('https://api.duckduckgo.com');
    instantAnswerUrl.searchParams.set('q', query);
    instantAnswerUrl.searchParams.set('format', 'json');
    instantAnswerUrl.searchParams.set('no_html', '1');
    instantAnswerUrl.searchParams.set('skip_disambig', '1');

    const instantAnswerResponse = await fetch(instantAnswerUrl.toString(), { signal: options?.signal });
    if (!instantAnswerResponse.ok) {
      throw new Error(`DuckDuckGo fallback error: ${instantAnswerResponse.status} ${instantAnswerResponse.statusText}`);
    }

    const data = await instantAnswerResponse.json();

    const results: SearchResult[] = (data.RelatedTopics || []).slice(0, num).map((r: any) => ({
      title: r.Text || r.title || '',
      url: r.FirstURL || r.url || '',
      snippet: r.Result || r.body || '',
    }));

    return {
      results,
      query,
      provider: this.name,
    };
  }
}
