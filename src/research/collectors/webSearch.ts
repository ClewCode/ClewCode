import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { searchWithProviders } from '../../tools/ResearchTool/searchProviders.js';
import { getFsImplementation } from '../../utils/fsOperations.js';
import type { ResearchSource } from '../types.js';

/**
 * Collect web sources using native search providers (DuckDuckGo, Tavily, Brave).
 * Replaces the old Python subprocess approach.
 */
export async function collectWebSearch(_cwd: string, query: string, runDir: string): Promise<ResearchSource[]> {
  const fsImpl = getFsImplementation();
  const sourcesDir = join(runDir, 'sources');

  if (!fsImpl.existsSync(sourcesDir)) {
    mkdirSync(sourcesDir, { recursive: true });
  }

  console.log(`[webSearch] Searching for: "${query}"`);

  let allResults: Array<{ title: string; url: string; excerpt: string }> = [];

  try {
    const providerResults = await searchWithProviders(query, { maxResults: 5 });
    for (const provider of providerResults) {
      for (const result of provider.results) {
        allResults.push({
          title: result.title,
          url: result.url,
          excerpt: result.excerpt || (result as any).content || (result as any).description || '',
        });
      }
    }

    // Deduplicate by URL
    const seen = new Set<string>();
    allResults = allResults
      .filter(r => {
        if (seen.has(r.url)) return false;
        seen.add(r.url);
        return true;
      })
      .slice(0, 5);
  } catch (err) {
    console.error(`[webSearch] Search failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  console.log(`[webSearch] Found ${allResults.length} results`);

  const sources: ResearchSource[] = [];
  const runDirName = runDir.split(/[\\/]/).pop() || '';

  for (let idx = 0; idx < allResults.length; idx++) {
    const res = allResults[idx]!;
    const sourceId = `src_web_${(idx + 1).toString().padStart(3, '0')}`;
    const filename = `${sourceId}.md`;
    const relativePath = join('.clew', 'research', 'runs', runDirName, 'sources', filename);

    const markdown = res.excerpt || '';
    const mdContent = [
      '---',
      `source_id: ${sourceId}`,
      `url: ${res.url}`,
      `title: ${JSON.stringify(res.title)}`,
      `retrieved_at: ${new Date().toISOString()}`,
      `extractor: search-providers`,
      `status: ok`,
      '---',
      '',
      `# ${res.title}`,
      '',
      markdown,
    ].join('\n');

    writeFileSync(join(runDir, 'sources', filename), mdContent, 'utf-8');

    sources.push({
      id: `source:web:${sourceId}`,
      type: 'web' as const,
      title: res.title,
      url: res.url,
      path: relativePath,
      retrievedAt: new Date().toISOString(),
      trust: 'medium' as const,
      excerpt: markdown.slice(0, 500),
    });
  }

  return sources;
}
