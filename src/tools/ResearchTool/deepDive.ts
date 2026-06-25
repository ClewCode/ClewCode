import { ofetch } from 'ofetch';
import { logError } from '../../utils/log.js';

// Configuration for deep dive
const DEEP_DIVE_CONFIG = {
  maxLevels: 3,
  maxLinksPerLevel: 5,
  maxContentLength: 10000, // Max characters to extract from each page
  timeout: 15000, // 15 seconds per request
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

export interface DeepDiveResult {
  originalUrl: string;
  level: number;
  title: string;
  content: string; // Extracted main text content
  excerpt: string; // Short excerpt
  links: string[]; // Links found on this page
  error?: string;
}

export interface DeepDiveOptions {
  maxLevels?: number;
  maxLinksPerLevel?: number;
  maxResultsPerSource?: number;
}

/**
 * Extract main text content from HTML
 * Simple implementation - in production, use a library like cheerio or jsdom
 */
function extractTextFromHtml(html: string): string {
  // Remove script and style tags
  let text = html.replace(/<script[^>]*>.*?<\/script>/gis, '');
  text = text.replace(/<style[^>]*>.*?<\/style>/gis, '');

  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, ' ');

  // Decode HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&/g, '&');
  text = text.replace(/</g, '<');
  text = text.replace(/>/g, '>');
  text = text.replace(/"/g, '"');
  text = text.replace(/'/g, "'");

  // Remove extra whitespace
  text = text.replace(/\s+/g, ' ').trim();

  return text;
}

/**
 * Extract relevant links from HTML
 */
function extractLinksFromHtml(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi;
  let match;

  while ((match = linkRegex.exec(html)) !== null) {
    let url = match[1];

    // Skip empty links, anchors, javascript, mailto
    if (!url || url.startsWith('#') || url.startsWith('javascript:') || url.startsWith('mailto:')) {
      continue;
    }

    // Convert relative URLs to absolute
    try {
      if (!url.startsWith('http')) {
        url = new URL(url, baseUrl).toString();
      }

      // Only keep http/https links
      if (url.startsWith('http://') || url.startsWith('https://')) {
        links.push(url);
      }
    } catch {
      // Invalid URL, skip
    }
  }

  // Remove duplicates and return top links
  return [...new Set(links)].slice(0, DEEP_DIVE_CONFIG.maxLinksPerLevel);
}

/**
 * Fetch and process a single URL
 */
async function fetchPageContent(url: string, level: number): Promise<DeepDiveResult> {
  try {
    const response = await ofetch.raw(url, {
      timeout: DEEP_DIVE_CONFIG.timeout,
      headers: {
        'User-Agent': DEEP_DIVE_CONFIG.userAgent,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      retry: false,
    });

    // Only process HTML content
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      return {
        originalUrl: url,
        level,
        title: url,
        content: '',
        excerpt: 'Non-HTML content',
        links: [],
      };
    }

    const html = response._data as string;
    const textContent = extractTextFromHtml(html).substring(0, DEEP_DIVE_CONFIG.maxContentLength);
    const excerpt = textContent.substring(0, 500);
    const links = extractLinksFromHtml(html, url);

    // Extract title from HTML
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : url;

    return {
      originalUrl: url,
      level,
      title,
      content: textContent,
      excerpt,
      links,
    };
  } catch (error) {
    logError(error as Error);
    return {
      originalUrl: url,
      level,
      title: url,
      content: '',
      excerpt: `Failed to fetch: ${error instanceof Error ? error.message : 'Unknown error'}`,
      links: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Perform deep dive research starting from initial URLs
 */
export async function performDeepDive(initialUrls: string[], options: DeepDiveOptions = {}): Promise<DeepDiveResult[]> {
  const { maxLevels = DEEP_DIVE_CONFIG.maxLevels, maxLinksPerLevel = DEEP_DIVE_CONFIG.maxLinksPerLevel } = options;

  const results: DeepDiveResult[] = [];
  const visitedUrls = new Set<string>();
  let currentLevelUrls = [...initialUrls];

  for (let level = 1; level <= maxLevels; level++) {
    // Filter out already visited URLs
    const urlsToFetch = currentLevelUrls.filter(url => !visitedUrls.has(url)).slice(0, maxLinksPerLevel);

    if (urlsToFetch.length === 0) {
      break;
    }

    // Fetch all URLs for this level in parallel
    const fetchPromises = urlsToFetch.map(url => {
      visitedUrls.add(url);
      return fetchPageContent(url, level);
    });

    const levelResults = await Promise.all(fetchPromises);

    // Add successful results
    for (const result of levelResults) {
      if (result.content || result.links.length > 0) {
        results.push(result);
      }

      // Collect links for next level
      if (level < maxLevels) {
        currentLevelUrls = [...currentLevelUrls, ...result.links];
      }
    }

    // Remove duplicates for next level
    currentLevelUrls = [...new Set(currentLevelUrls)];
  }

  return results;
}

/**
 * Filter deep dive results to only include relevant ones
 */
export function filterDeepDiveResults(results: DeepDiveResult[], query: string): DeepDiveResult[] {
  const queryTerms = query
    .toLowerCase()
    .split(' ')
    .filter(term => term.length > 2);

  return results.filter(result => {
    // Always include level 1 results (original search results)
    if (result.level === 1) return true;

    // For deeper levels, check if content is relevant to query
    const contentLower = result.content.toLowerCase();
    const titleLower = result.title.toLowerCase();

    // Check if at least 2 query terms are present in content or title
    const matchCount = queryTerms.filter(term => contentLower.includes(term) || titleLower.includes(term)).length;

    return matchCount >= 2;
  });
}
