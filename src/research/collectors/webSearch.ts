import { spawnSync } from 'child_process';
import { join } from 'path';
import { getFsImplementation } from '../../utils/fsOperations.js';
import type { ResearchSource } from '../types.js';

type SearchResult = {
  title: string;
  url: string;
  body: string;
};

type ScrapeResult = {
  status: 'ok' | 'failed';
  title?: string;
  author?: string;
  published_at?: string;
  markdown?: string;
  url?: string;
  error?: string;
};

export async function collectWebSearch(cwd: string, query: string, runDir: string): Promise<ResearchSource[]> {
  const fsImpl = getFsImplementation();
  const sourcesDir = join(runDir, 'sources');

  if (!fsImpl.existsSync(sourcesDir)) {
    // Explicitly create sources directory using Node's fs implementation
    // wrapped in Bun compatibility layers if needed, or getFsImplementation
    const fs = require('fs');
    fs.mkdirSync(sourcesDir, { recursive: true });
  }

  console.log(`[webSearch] Querying DuckDuckGo for: "${query}"`);

  // 1. Run DuckDuckGo search via our Python helper script
  const searchProcess = spawnSync('python', ['scripts/scrape.py', '--search', query, '--max-results', '5'], {
    encoding: 'utf-8',
    timeout: 8000,
  });

  if (searchProcess.error || searchProcess.status !== 0) {
    console.error(`[webSearch] Search failed: ${searchProcess.stderr || 'Subprocess error'}`);
    return [];
  }

  let searchData;
  try {
    searchData = JSON.parse(searchProcess.stdout.trim());
  } catch (err) {
    console.error(`[webSearch] Failed to parse search JSON output`);
    return [];
  }

  if (searchData.status !== 'ok' || !searchData.results) {
    console.error(`[webSearch] Search returned error: ${searchData.error || 'unknown error'}`);
    return [];
  }

  const results: SearchResult[] = searchData.results;
  const sources: ResearchSource[] = [];

  console.log(`[webSearch] Found ${results.length} search results. Scraping concurrently...`);

  // 2. Concurrently scrape each URL using Scrapling via our Python helper
  // We limit concurrent Playwright/HTTP fetches to respect rate limits and keep CLI responsive.
  const scrapePromises = results.map(async (res, idx) => {
    const sourceId = `src_web_${(idx + 1).toString().padStart(3, '0')}`;
    const filename = `${sourceId}.md`;
    const relativePath = join('.claude', 'research', 'runs', runDir.split(/[\\/]/).pop() || '', 'sources', filename);
    const fullPath = join(cwd, relativePath);

    console.log(`[webSearch] [${sourceId}] Scraping: ${res.url}`);

    const scrapeProcess = spawnSync('python', ['scripts/scrape.py', '--url', res.url], {
      encoding: 'utf-8',
      timeout: 10000, // 10-second limit per scrape
    });

    if (scrapeProcess.error || scrapeProcess.status !== 0) {
      console.error(`[webSearch] [${sourceId}] Failed to scrape URL: ${res.url}`);
      return null;
    }

    let scrapeData: ScrapeResult;
    try {
      scrapeData = JSON.parse(scrapeProcess.stdout.trim());
    } catch (err) {
      console.error(`[webSearch] [${sourceId}] Failed to parse scraped JSON`);
      return null;
    }

    if (scrapeData.status !== 'ok' || !scrapeData.markdown) {
      console.error(`[webSearch] [${sourceId}] Scraper returned error: ${scrapeData.error || 'Empty content'}`);
      return null;
    }

    const title = scrapeData.title || res.title || 'Untitled Web Page';
    const author = scrapeData.author || '';
    const publishedAt = scrapeData.published_at || '';
    const markdown = scrapeData.markdown;

    // 3. Construct frontmatter metadata and Markdown body
    const mdContent = [
      '---',
      `source_id: ${sourceId}`,
      `url: ${res.url}`,
      `canonical_url: ${res.url}`,
      `title: ${JSON.stringify(title)}`,
      `author: ${JSON.stringify(author)}`,
      `published_at: ${publishedAt}`,
      `retrieved_at: ${new Date().toISOString()}`,
      `extractor: scrapling-stealth`,
      `status: ok`,
      '---',
      '',
      `# ${title}`,
      '',
      markdown,
    ].join('\n');

    // 4. Save markdown file to disk
    const fs = require('fs');
    fs.writeFileSync(fullPath, mdContent, 'utf-8');

    return {
      id: `source:web:${sourceId}`,
      type: 'web' as const,
      title: title,
      url: res.url,
      path: relativePath,
      retrievedAt: new Date().toISOString(),
      trust: 'medium' as const,
      excerpt: markdown.slice(0, 500) + '...',
    };
  });

  const scrapedSources = await Promise.all(scrapePromises);

  for (const s of scrapedSources) {
    if (s) {
      sources.push(s);
    }
  }

  return sources;
}
