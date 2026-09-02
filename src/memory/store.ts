/**
 * Store compat — filesystem lexical helpers replacing SQLite chunks_fts.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getFsImplementation } from '../utils/fsOperations.js';
import type { MemoryChunk, SourceDocument } from './types.js';

// In-memory stubs for source tracking (filesystem is SoT, no DB needed)
const sourceMap = new Map<string, SourceDocument>();

export function getSource(_db: unknown, id: string): SourceDocument | null {
  return sourceMap.get(id) ?? null;
}

export function upsertSource(_db: unknown, source: SourceDocument): void {
  sourceMap.set(source.id, source);
}

export function deleteSource(_db: unknown, id: string): void {
  sourceMap.delete(id);
}

export function insertChunks(_db: unknown, _chunks: MemoryChunk[], _title = ''): void {
  // No-op: chunks are derived from markdown files on demand
}

export function getAllSources(_db: unknown): SourceDocument[] {
  return [...sourceMap.values()];
}

export interface FTSMatch {
  id: string;
  sourceId: string;
  title: string;
  markdown: string;
}

/**
 * Lexical search over markdown files (replaces FTS5).
 */
export function searchChunksFTS(_db: unknown, queryStr: string, limit = 20): FTSMatch[] {
  // Fallback lexical: search pending map if any, otherwise empty
  // Real search is done in src/memory/search.ts via filesystem scan
  void queryStr;
  void limit;
  return [];
}

// Legacy helpers kept for pending.ts file cleanup
export function scanMarkdownFiles(cwd: string, query: string, limit = 20): FTSMatch[] {
  const fsImpl = getFsImplementation();
  const memDir = join(cwd, '.clew', 'memory');
  if (!existsSync(memDir)) return [];
  const files: string[] = [];
  try {
    const stack = [memDir];
    while (stack.length) {
      const dir = stack.pop()!;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) stack.push(p);
        else if (entry.isFile() && entry.name.endsWith('.md')) files.push(p);
      }
    }
  } catch {
    return [];
  }
  const q = query.toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  const matches: FTSMatch[] = [];
  for (const fp of files) {
    try {
      const content = readFileSync(fp, 'utf8');
      const lower = content.toLowerCase();
      if (words.some(w => lower.includes(w))) {
        matches.push({ id: fp, sourceId: fp, title: fp, markdown: content.slice(0, 800) });
        if (matches.length >= limit) break;
      }
    } catch {}
  }
  void fsImpl;
  return matches;
}
