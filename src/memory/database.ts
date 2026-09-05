/**
 * MemoryDB — Filesystem-backed memory store
 *
 * Replaces SQLite with Markdown+YAML files as Source of Truth.
 * Each memory is a file under `.clew/memory/store/<key>.md` with frontmatter.
 * Timeline is append-only `.clew/memory/timeline.jsonl`.
 *
 * Filesystem = SoT, no derived SQLite cache.
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getCwd } from '../utils/cwd.js';
import { getMemoryDirPath } from './hierarchy.js';
import { getIndexedEntries, invalidateIndex, setCacheOverride } from './indexCache.js';
import { MEMORY_TYPES, type MemoryType } from './schema.js';

export type MemoryRecord = {
  id: string;
  projectPath: string;
  type: MemoryType;
  content: string;
  importance: number;
  confidence: number;
  accessCount: number;
  lastAccessedAt: string | null;
  createdAt: string;
};

export type TimelineRecord = {
  id: string;
  memoryId: string;
  event: string;
  note: string | null;
  createdAt: string;
};

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function simpleHash(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    const chr = s.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

function nowISO(): string {
  return new Date().toISOString();
}

function sanitizeKey(key: string): string {
  return (
    key
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 120) || `mem_${simpleHash(key)}`
  );
}

let _overrideStoreDir: string | null = null;
let _overrideTimelinePath: string | null = null;

function getStoreDir(): string {
  if (_overrideStoreDir) return _overrideStoreDir;
  return join(getMemoryDirPath(), 'store');
}

function getTimelinePath(): string {
  if (_overrideTimelinePath) return _overrideTimelinePath;
  return join(getMemoryDirPath(), 'timeline.jsonl');
}

function ensureStoreDir(): void {
  mkdirSync(getStoreDir(), { recursive: true });
}

function memoryFilePath(key: string): string {
  return join(getStoreDir(), `${sanitizeKey(key)}.md`);
}

// ── Frontmatter helpers ──────────────────────────────────────

function parseMemoryFile(raw: string, keyFallback: string): MemoryRecord | null {
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
  const id = meta.id || generateId();
  const type = (meta.type as MemoryType) || 'note';
  return {
    id,
    projectPath: meta.project_path || meta.projectpath || getCwd(),
    type: MEMORY_TYPES.includes(type as MemoryType) ? (type as MemoryType) : 'note',
    content: body.trim(),
    importance: meta.importance ? Number.parseFloat(meta.importance) : 0.5,
    confidence: meta.confidence ? Number.parseFloat(meta.confidence) : 0.5,
    accessCount: meta.access_count ? Number.parseInt(meta.access_count, 10) : 0,
    lastAccessedAt: meta.last_accessed_at || null,
    createdAt: meta.created_at || nowISO(),
  };
}

function stringifyMemoryFile(record: MemoryRecord, key: string, contentHash: string): string {
  const lines = ['---'];
  lines.push(`id: ${record.id}`);
  lines.push(`key: ${key}`);
  lines.push(`type: ${record.type}`);
  lines.push(`project_path: ${record.projectPath}`);
  lines.push(`importance: ${record.importance}`);
  lines.push(`confidence: ${record.confidence}`);
  lines.push(`access_count: ${record.accessCount}`);
  if (record.lastAccessedAt) lines.push(`last_accessed_at: ${record.lastAccessedAt}`);
  lines.push(`created_at: ${record.createdAt}`);
  lines.push(`content_hash: ${contentHash}`);
  lines.push('---');
  lines.push('');
  lines.push(record.content.trim());
  return lines.join('\n');
}

function readAllRecords(): Array<{ record: MemoryRecord; key: string; hash: string; filePath: string }> {
  try {
    const indexed = getIndexedEntries();
    const dir = getStoreDir();
    const hasFiles = existsSync(dir) && readdirSync(dir).some(f => f.endsWith('.md'));
    if (indexed.length > 0 || !hasFiles) {
      return indexed.map(e => ({
        record: {
          id: e.id,
          projectPath: e.project_path,
          type: e.type,
          content: e.content,
          importance: e.importance,
          confidence: e.confidence,
          accessCount: e.access_count,
          lastAccessedAt: e.last_accessed_at,
          createdAt: e.created_at,
        },
        key: e.key,
        hash: e.content_hash,
        filePath: join(dir, e.relPath),
      }));
    }
  } catch {
    // fallback to direct scan
  }
  const dir = getStoreDir();
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir);
  const out: Array<{ record: MemoryRecord; key: string; hash: string; filePath: string }> = [];
  for (const entry of entries) {
    if (!entry.endsWith('.md')) continue;
    const filePath = join(dir, entry);
    try {
      const raw = readFileSync(filePath, 'utf8');
      const keyMatch = raw.match(/^---[\s\S]*?^key:\s*(.+)$/m);
      const key = keyMatch ? keyMatch[1].trim().replace(/^["']|["']$/g, '') : entry.replace(/\.md$/, '');
      const hashMatch = raw.match(/^content_hash:\s*(.+)$/m);
      const hash = hashMatch ? hashMatch[1].trim() : simpleHash(raw);
      const rec = parseMemoryFile(raw, key);
      if (!rec) continue;
      out.push({ record: rec, key, hash, filePath });
    } catch {
      // skip unreadable
    }
  }
  return out;
}

function writeRecordAtomic(filePath: string, content: string): void {
  const tmp = `${filePath}.tmp`;
  writeFileSync(tmp, content, 'utf8');
  try {
    renameSync(tmp, filePath);
  } catch {
    writeFileSync(filePath, content, 'utf8');
    try {
      unlinkSync(tmp);
    } catch {
      // The destination write succeeded; stale temp-file cleanup is best-effort.
    }
  }
  invalidateIndex();
}

function computeRelevance(query: string, content: string, key: string, type: string): number {
  const q = query.toLowerCase();
  const queryWords = q.split(/\s+/).filter(w => w.length > 2);
  if (queryWords.length === 0) return 0;
  const haystack = `${key} ${type} ${content}`.toLowerCase();
  let matches = 0;
  for (const word of queryWords) {
    if (haystack.includes(word)) matches++;
  }
  return Math.min(1, (matches / Math.max(1, queryWords.length)) * 1.2);
}

// ── Timeline helpers (JSONL) ─────────────────────────────────

function appendTimeline(record: TimelineRecord): void {
  ensureStoreDir();
  appendFileSync(getTimelinePath(), `${JSON.stringify(record)}\n`, 'utf8');
}

function readTimeline(): TimelineRecord[] {
  const p = getTimelinePath();
  if (!existsSync(p)) return [];

  let raw: string;
  try {
    raw = readFileSync(p, 'utf8');
  } catch {
    return [];
  }

  const records: TimelineRecord[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line) as TimelineRecord);
    } catch {
      // JSONL is append-only. A crash can leave a truncated tail record; preserve
      // every valid record instead of making the entire timeline unreadable.
    }
  }
  return records;
}

/**
 * MemoryDB — filesystem singleton (name is historical; storage is markdown
 * files under `.clew/memory/store/`, not SQLite — see hierarchy.ts).
 * Kept API-compatible with the old SQLite version so existing callers
 * (`MemoryDB.init/getInstance/isInitialized/reset`) keep working.
 */
export class MemoryDB {
  private static instance: MemoryDB | null = null;

  private constructor(_storeDir: string) {
    ensureStoreDir();
  }

  static init(storeDir: string): MemoryDB {
    if (MemoryDB.instance) throw new Error('MemoryDB already initialized');
    if (storeDir === ':memory:') {
      const tmp = mkdtempSync(join(tmpdir(), 'clew-mem-'));
      _overrideStoreDir = join(tmp, 'store');
      _overrideTimelinePath = join(tmp, 'timeline.jsonl');
      setCacheOverride(_overrideStoreDir, join(tmp, 'index.json'));
    } else if (storeDir) {
      // Accept either `.clew/memory` or `.clew/memory/store`; normalize to base.
      const base = storeDir.endsWith('store') ? storeDir.slice(0, -6) : storeDir;
      _overrideStoreDir = join(base, 'store');
      _overrideTimelinePath = join(base, 'timeline.jsonl');
      setCacheOverride(_overrideStoreDir, join(base, 'index.json'));
    }
    MemoryDB.instance = new MemoryDB(storeDir);
    return MemoryDB.instance;
  }

  static getInstance(): MemoryDB {
    if (!MemoryDB.instance) throw new Error('MemoryDB not initialized. Call MemoryDB.init(path) first.');
    return MemoryDB.instance;
  }

  static isInitialized(): boolean {
    return MemoryDB.instance !== null;
  }

  static reset(): void {
    if (MemoryDB.instance) {
      MemoryDB.instance = null;
    }
    _overrideStoreDir = null;
    _overrideTimelinePath = null;
    setCacheOverride(null, null);
  }

  // ── CRUD ─────────────────────────────────────────────────

  saveMemory(opts: {
    projectPath: string;
    type: MemoryType;
    content: string;
    importance?: number;
    confidence?: number;
  }): string {
    const all = readAllRecords();
    const existing = all.find(
      r =>
        r.record.projectPath === opts.projectPath && r.record.type === opts.type && r.record.content === opts.content,
    );
    if (existing) {
      if (!this.updateImportance(existing.record.id, 0.05)) {
        throw new Error(`Failed to reinforce memory ${existing.record.id}`);
      }
      this.logEvent({ memoryId: existing.record.id, event: 'reinforced', note: 'duplicate save' });
      return existing.record.id;
    }
    const id = generateId();
    const key = `auto.${sanitizeKey(opts.content.slice(0, 40))}.${id.slice(-6)}`;
    const record: MemoryRecord = {
      id,
      projectPath: opts.projectPath,
      type: opts.type,
      content: opts.content,
      importance: opts.importance ?? 0.5,
      confidence: opts.confidence ?? 0.5,
      accessCount: 0,
      lastAccessedAt: null,
      createdAt: nowISO(),
    };
    const hash = simpleHash(opts.content);
    ensureStoreDir();
    writeRecordAtomic(memoryFilePath(key), stringifyMemoryFile(record, key, hash));
    this.logEvent({ memoryId: id, event: 'created' });
    return id;
  }

  findByKey(key: string): MemoryRecord | null {
    const fp = memoryFilePath(key);
    if (!existsSync(fp)) return null;
    try {
      const raw = readFileSync(fp, 'utf8');
      const rec = parseMemoryFile(raw, key);
      return rec;
    } catch {
      return null;
    }
  }

  upsertMemory(opts: {
    key: string;
    projectPath: string;
    type: MemoryType;
    content: string;
    importance?: number;
    confidence?: number;
  }): { id: string; action: 'created' | 'updated' | 'unchanged' } {
    const fp = memoryFilePath(opts.key);
    const newHash = simpleHash(opts.content);
    if (existsSync(fp)) {
      try {
        const raw = readFileSync(fp, 'utf8');
        const hashMatch = raw.match(/^content_hash:\s*(.+)$/m);
        const oldHash = hashMatch ? hashMatch[1].trim() : '';
        if (oldHash === newHash) {
          const rec = parseMemoryFile(raw, opts.key);
          return { id: rec ? rec.id : opts.key, action: 'unchanged' };
        }
        const existing = parseMemoryFile(raw, opts.key);
        const id = existing?.id ?? generateId();
        const record: MemoryRecord = {
          id,
          projectPath: opts.projectPath,
          type: opts.type,
          content: opts.content,
          importance: opts.importance ?? 0.5,
          confidence: opts.confidence ?? 0.5,
          accessCount: existing?.accessCount ?? 0,
          lastAccessedAt: existing?.lastAccessedAt ?? null,
          createdAt: existing?.createdAt ?? nowISO(),
        };
        writeRecordAtomic(fp, stringifyMemoryFile(record, opts.key, newHash));
        this.logEvent({ memoryId: id, event: 'corrected', note: 'content updated by scan' });
        return { id, action: 'updated' };
      } catch {
        // fallthrough to create
      }
    }
    const id = generateId();
    const record: MemoryRecord = {
      id,
      projectPath: opts.projectPath,
      type: opts.type,
      content: opts.content,
      importance: opts.importance ?? 0.5,
      confidence: opts.confidence ?? 0.5,
      accessCount: 0,
      lastAccessedAt: null,
      createdAt: nowISO(),
    };
    ensureStoreDir();
    writeRecordAtomic(fp, stringifyMemoryFile(record, opts.key, newHash));
    this.logEvent({ memoryId: id, event: 'created' });
    return { id, action: 'created' };
  }

  getMemory(id: string): MemoryRecord | null {
    const all = readAllRecords();
    const found = all.find(r => r.record.id === id);
    if (!found) return null;
    // Bump access
    const updated: MemoryRecord = {
      ...found.record,
      accessCount: found.record.accessCount + 1,
      lastAccessedAt: nowISO(),
    };
    try {
      writeRecordAtomic(found.filePath, stringifyMemoryFile(updated, found.key, found.hash));
    } catch {
      // Access counters are ranking metadata; reads must remain available.
    }
    return found.record;
  }

  queryMemories(opts: {
    projectPath: string;
    type?: MemoryType;
    limit?: number;
    minImportance?: number;
  }): MemoryRecord[] {
    let records = readAllRecords()
      .map(r => r.record)
      .filter(m => m.projectPath === opts.projectPath);
    if (opts.type) records = records.filter(m => m.type === opts.type);
    if (opts.minImportance !== undefined) records = records.filter(m => m.importance >= opts.minImportance!);
    records.sort((a, b) => b.importance - a.importance);
    if (opts.limit) records = records.slice(0, opts.limit);
    return records;
  }

  getBudgetedMemories(opts: { projectPath: string; maxTokens: number; minImportance?: number }): MemoryRecord[] {
    const candidates = this.queryMemories({ projectPath: opts.projectPath, minImportance: opts.minImportance });
    const now = Date.now();
    const ranked = candidates.map(m => {
      const lastAccess = m.lastAccessedAt ? (now - new Date(m.lastAccessedAt).getTime()) / 86400000 : 30;
      const recencyWeight = Math.max(0.5, 1 - lastAccess / 90);
      const score = m.importance * m.confidence * recencyWeight;
      return { memory: m, score };
    });
    ranked.sort((a, b) => b.score - a.score);
    const result: MemoryRecord[] = [];
    const charsPerToken = 4;
    let used = 0;
    for (const { memory } of ranked) {
      const estimatedTokens = Math.ceil(memory.content.length / charsPerToken) + 10;
      if (used + estimatedTokens > opts.maxTokens) continue;
      result.push(memory);
      used += estimatedTokens;
    }
    return result;
  }

  updateScores(id: string, deltas: { importance?: number; confidence?: number }): boolean {
    const all = readAllRecords();
    const found = all.find(r => r.record.id === id);
    if (!found) return false;

    const updated: MemoryRecord = {
      ...found.record,
      importance: Math.min(1, Math.max(0, found.record.importance + (deltas.importance ?? 0))),
      confidence: Math.min(1, Math.max(0, found.record.confidence + (deltas.confidence ?? 0))),
    };
    try {
      writeRecordAtomic(found.filePath, stringifyMemoryFile(updated, found.key, found.hash));
      return true;
    } catch {
      return false;
    }
  }

  updateImportance(id: string, delta: number): boolean {
    return this.updateScores(id, { importance: delta });
  }

  updateConfidence(id: string, delta: number): boolean {
    return this.updateScores(id, { confidence: delta });
  }

  deleteMemory(id: string): boolean {
    const all = readAllRecords();
    const found = all.find(r => r.record.id === id);
    if (!found) return false;
    try {
      unlinkSync(found.filePath);
      invalidateIndex();
      return true;
    } catch {
      return false;
    }
  }

  deleteMemoryByKey(key: string): boolean {
    const fp = memoryFilePath(key);
    if (!existsSync(fp)) return false;
    try {
      unlinkSync(fp);
      invalidateIndex();
      return true;
    } catch {
      return false;
    }
  }

  recallMemories(opts: {
    projectPath: string;
    query?: string;
    limit?: number;
    minImportance?: number;
    verbose?: boolean;
  }): Array<MemoryRecord & { score: number; scoreBreakdown?: Record<string, number> }> {
    const all = readAllRecords();
    const filtered = all.filter(
      r =>
        r.record.projectPath === opts.projectPath &&
        (opts.minImportance === undefined || r.record.importance >= opts.minImportance!),
    );
    const now = Date.now();
    const scored = filtered
      .map(({ record, key }) => {
        const lastAccess = record.lastAccessedAt ? (now - new Date(record.lastAccessedAt).getTime()) / 86400000 : 90;
        const recency = Math.max(0, 1 - lastAccess / 90);
        const accessBonus = Math.min(1, record.accessCount / 20);
        const relevance = opts.query ? computeRelevance(opts.query, record.content, key, record.type) : 0;
        const relevanceScore = relevance * 0.45;
        const importanceScore = record.importance * 0.2;
        const recencyScore = recency * 0.15;
        const accessScore = accessBonus * 0.1;
        const confidenceScore = record.confidence * 0.1;
        const score = relevanceScore + importanceScore + recencyScore + accessScore + confidenceScore;
        return {
          ...record,
          score,
          _key: key,
          scoreBreakdown: opts.verbose
            ? {
                relevance: relevanceScore,
                importance: importanceScore,
                recency: recencyScore,
                access: accessScore,
                confidence: confidenceScore,
                total: score,
              }
            : undefined,
        };
      })
      .sort((a, b) => b.score - a.score);

    const limited = opts.limit ? scored.slice(0, opts.limit) : scored;
    // Bump access
    const nowISOStr = nowISO();
    for (const mem of limited) {
      const allRec = all.find(r => r.record.id === mem.id);
      if (!allRec) continue;
      const updated: MemoryRecord = {
        ...allRec.record,
        accessCount: allRec.record.accessCount + 1,
        lastAccessedAt: nowISOStr,
      };
      try {
        writeRecordAtomic(allRec.filePath, stringifyMemoryFile(updated, allRec.key, allRec.hash));
      } catch {
        // Access timestamps are ranking metadata only. Recall itself must stay
        // available when this best-effort bookkeeping cannot be persisted.
      }
    }
    return limited.map(
      ({ _key, ...rest }) => rest as MemoryRecord & { score: number; scoreBreakdown?: Record<string, number> },
    );
  }

  logEvent(opts: { memoryId: string; event: string; note?: string }): string {
    const id = generateId();
    const rec: TimelineRecord = {
      id,
      memoryId: opts.memoryId,
      event: opts.event,
      note: opts.note ?? null,
      createdAt: nowISO(),
    };
    appendTimeline(rec);
    return id;
  }

  getTimeline(memoryId: string): TimelineRecord[] {
    return readTimeline()
      .filter(t => t.memoryId === memoryId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getRecentTimeline(limit = 50): TimelineRecord[] {
    return readTimeline()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  exportMemories(limit = 50, projectPath?: string): MemoryRecord[] {
    let records = readAllRecords().map(r => r.record);
    if (projectPath) records = records.filter(m => m.projectPath === projectPath);
    records.sort((a, b) => b.importance - a.importance);
    return records.slice(0, limit);
  }

  pruneMemories(opts?: { maxAgeDays?: number; minScore?: number; maxAccessCount?: number }): number {
    const maxAgeDays = opts?.maxAgeDays ?? 60;
    const minScore = opts?.minScore ?? 0.09;
    const maxAccessCount = opts?.maxAccessCount ?? 2;
    const cutoff = new Date(Date.now() - maxAgeDays * 86400000).toISOString();
    const all = readAllRecords();
    let deleted = 0;
    for (const { record, filePath, key } of all) {
      const isProtected = key.startsWith('scan.');
      if (isProtected) continue;
      const score = record.importance * record.confidence;
      const ageOk = record.createdAt < cutoff && (record.lastAccessedAt ?? record.createdAt) < cutoff;
      if (score < minScore && record.accessCount <= maxAccessCount && ageOk) {
        try {
          unlinkSync(filePath);
          deleted++;
        } catch {
          // A failed deletion is not counted as pruned; continue with other records.
        }
      }
    }
    if (deleted > 0) invalidateIndex();
    return deleted;
  }

  getStats(): { total: number; byType: Record<string, number> } {
    const records = readAllRecords().map(r => r.record);
    const byType: Record<string, number> = {};
    for (const r of records) byType[r.type] = (byType[r.type] ?? 0) + 1;
    return { total: records.length, byType };
  }

  close(): void {
    // Filesystem-backed store has no persistent handle to close.
  }
}
