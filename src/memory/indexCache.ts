/**
 * IndexCache — derived ephemeral cache for filesystem memory store.
 *
 * Filesystem is SoT, index.json is derived and gitignored.
 * Structure: .clew/memory/index.json
 * {
 *   version: 1,
 *   generatedAt: ISO,
 *   entries: [{ id, key, type, importance, confidence, access_count, created_at, last_accessed_at, project_path, content_hash, relPath, mtimeMs, size, content }]
 * }
 *
 * Cache invalidation: mtimeMs + size + content_hash
 * If file mtime/size unchanged, reuse entry. Otherwise re-parse.
 * Deleted files are pruned. New files are added.
 * Atomic write via tmp + rename.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { getMemoryDirPath } from './hierarchy.js';
import type { MemoryType } from './schema.js';

export type IndexEntry = {
  id: string;
  key: string;
  type: MemoryType;
  importance: number;
  confidence: number;
  access_count: number;
  last_accessed_at: string | null;
  created_at: string;
  project_path: string;
  content_hash: string;
  relPath: string;
  mtimeMs: number;
  size: number;
  content: string;
};

export type MemoryIndex = {
  version: 1;
  generatedAt: string;
  entries: IndexEntry[];
};

let _overrideIndexPath: string | null = null;
let _overrideStoreDir2: string | null = null;

export function setCacheOverride(storeDir: string | null, indexPath: string | null): void {
  _overrideStoreDir2 = storeDir;
  _overrideIndexPath = indexPath;
}

function getIndexPath(): string {
  if (_overrideIndexPath) return _overrideIndexPath;
  return join(getMemoryDirPath(), 'index.json');
}

function getStoreDir(): string {
  if (_overrideStoreDir2) return _overrideStoreDir2;
  return join(getMemoryDirPath(), 'store');
}

function parseEntry(raw: string, relPath: string, mtimeMs: number, size: number): IndexEntry | null {
  const FM_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
  const match = raw.match(FM_REGEX);
  if (!match) return null;
  const [, yamlBlock, body] = match;
  const meta: Record<string, string> = {};
  for (const line of yamlBlock.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const k = line.slice(0, idx).trim().toLowerCase();
    let v = line.slice(idx + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    meta[k] = v;
  }
  const content = body.trim();
  // Extract key
  const key = meta.key || relPath.replace(/\.md$/, '');
  const hashMatch = raw.match(/^content_hash:\s*(.+)$/m);
  const contentHash = hashMatch ? hashMatch[1].trim() : '';
  return {
    id: meta.id || key,
    key,
    type: (meta.type as MemoryType) || 'note',
    importance: meta.importance ? Number.parseFloat(meta.importance) : 0.5,
    confidence: meta.confidence ? Number.parseFloat(meta.confidence) : 0.5,
    access_count: meta.access_count ? Number.parseInt(meta.access_count, 10) : 0,
    last_accessed_at: meta.last_accessed_at || null,
    created_at: meta.created_at || new Date().toISOString(),
    project_path: meta.project_path || '',
    content_hash: contentHash,
    relPath,
    mtimeMs,
    size,
    content,
  };
}

export function loadIndex(): MemoryIndex | null {
  const p = getIndexPath();
  if (!existsSync(p)) return null;
  try {
    const raw = readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw) as MemoryIndex;
    if (parsed.version !== 1 || !Array.isArray(parsed.entries)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveIndex(index: MemoryIndex): void {
  const p = getIndexPath();
  const dir = getMemoryDirPath();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = `${p}.tmp`;
  writeFileSync(tmp, JSON.stringify(index, null, 2), 'utf8');
  try {
    renameSync(tmp, p);
  } catch {
    writeFileSync(p, JSON.stringify(index, null, 2), 'utf8');
    try {
      unlinkSync(tmp);
    } catch {}
  }
}

/**
 * Sync index with filesystem store. Returns fresh index.
 * Only re-parses files whose mtime/size changed.
 */
export function syncIndex(): MemoryIndex {
  const storeDir = getStoreDir();
  const existing = loadIndex();
  const existingMap = new Map<string, IndexEntry>();
  if (existing) {
    for (const e of existing.entries) existingMap.set(e.relPath, e);
  }

  const entries: IndexEntry[] = [];
  if (!existsSync(storeDir)) {
    const idx: MemoryIndex = { version: 1, generatedAt: new Date().toISOString(), entries: [] };
    saveIndex(idx);
    return idx;
  }

  const files = readdirSync(storeDir);
  for (const file of files) {
    if (!file.endsWith('.md')) continue;
    const abs = join(storeDir, file);
    let stat: ReturnType<typeof statSync>;
    try {
      stat = statSync(abs);
    } catch {
      continue;
    }
    const mtimeMs = stat.mtimeMs;
    const size = stat.size;
    const cached = existingMap.get(file);
    if (cached && cached.mtimeMs === mtimeMs && cached.size === size) {
      entries.push(cached);
      existingMap.delete(file);
      continue;
    }
    try {
      const raw = readFileSync(abs, 'utf8');
      const entry = parseEntry(raw, file, mtimeMs, size);
      if (entry) entries.push(entry);
    } catch {
      // skip unreadable
    }
  }
  // Remaining in existingMap are deleted files — drop them

  const idx: MemoryIndex = { version: 1, generatedAt: new Date().toISOString(), entries };
  saveIndex(idx);
  return idx;
}

export function invalidateIndex(): void {
  const p = getIndexPath();
  if (existsSync(p)) {
    try {
      unlinkSync(p);
    } catch {}
  }
}

/** Get entries, sync if stale/missing. */
export function getIndexedEntries(): IndexEntry[] {
  return syncIndex().entries;
}
