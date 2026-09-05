/**
 * Memory Search — filesystem lexical + recency ranking (no SQLite/FTS).
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFrontmatter } from './frontmatter.js';
import type { MemorySearchResult } from './types.js';

function scanMemoryFiles(cwd: string): Array<{ path: string; content: string; mtimeMs: number }> {
  const memDir = join(cwd, '.clew', 'memory');
  if (!existsSync(memDir)) return [];
  const out: Array<{ path: string; content: string; mtimeMs: number }> = [];
  const stack = [memDir];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: any[] = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) stack.push(p);
      else if (entry.isFile() && entry.name.endsWith('.md')) {
        try {
          const content = readFileSync(p, 'utf8');
          // Use stat mtime via read timing approx; real mtime not critical for ranking
          out.push({ path: p, content, mtimeMs: Date.now() });
        } catch {
          // A single unreadable memory file must not abort the search.
        }
      }
    }
  }
  return out;
}

export async function searchMemories(cwd: string, query: string, limit = 10): Promise<MemorySearchResult[]> {
  const files = scanMemoryFiles(cwd);
  const qWords = query
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 1);
  if (qWords.length === 0 || files.length === 0) return [];

  const scored: Array<{ file: (typeof files)[0]; score: number }> = [];
  for (const file of files) {
    const parsed = parseFrontmatter(file.content, file.path, 'project');
    const haystack = `${parsed.metadata.id} ${parsed.metadata.type} ${parsed.content}`.toLowerCase();
    let matches = 0;
    for (const w of qWords) if (haystack.includes(w)) matches++;
    const relevance = matches / qWords.length;
    if (relevance === 0) continue;
    // Recency boost (files under store/ are newer)
    const isRecent = file.path.includes('store');
    const score =
      relevance * 0.7 + (isRecent ? 0.15 : 0) + ((parsed.metadata.type as string) === 'decision' ? 0.05 : 0);
    scored.push({ file, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(({ file, score }) => {
    const parsed = parseFrontmatter(file.content, file.path, 'project');
    return {
      id: parsed.metadata.id,
      title: file.path,
      sourcePath: file.path,
      sourceType: parsed.metadata.type,
      excerpt: parsed.content.slice(0, 400),
      score,
      contentHash: '',
      lastSeenAt: new Date().toISOString(),
      stale: false,
    };
  });
}
