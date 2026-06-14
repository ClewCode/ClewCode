/**
 * MemoryStore — bridges agent context to the memory DB.
 *
 * Provides key-value context storage that persists across sessions.
 * Agent can store learned facts, preferences, and project knowledge
 * and retrieve them for prompt injection.
 */

import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DOT_CLEW } from '../utils/clewPaths.js';
import { getOriginalCwd } from '../bootstrap/state.js';

interface ContextEntry {
  key: string;
  value: string;
  type: string;
  tags: string;
  confidence: number;
  created_at: number;
  updated_at: number;
  access_count: number;
}

let _db: Database | null = null;

function getDb(): Database {
  if (_db) return _db;

  const cwd = getOriginalCwd();
  const dir = join(cwd, DOT_CLEW, 'memory');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  _db = new Database(join(dir, 'context.db'), { create: true });
  _db.run('PRAGMA journal_mode = WAL');
  _db.run('PRAGMA synchronous = NORMAL');

  _db.run(`CREATE TABLE IF NOT EXISTS context (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'note',
    tags TEXT NOT NULL DEFAULT '[]',
    confidence REAL NOT NULL DEFAULT 0.5,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    access_count INTEGER NOT NULL DEFAULT 0
  )`);

  _db.run('CREATE INDEX IF NOT EXISTS idx_context_type ON context(type)');
  _db.run('CREATE INDEX IF NOT EXISTS idx_context_updated ON context(updated_at DESC)');

  return _db;
}

export function closeMemoryStore(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

/** Store a context entry (upsert). */
export function storeContext(
  key: string,
  value: string,
  opts: {
    type?: string;
    tags?: string[];
    confidence?: number;
  } = {},
): void {
  const db = getDb();
  const now = Date.now();

  db.prepare(`
    INSERT INTO context (key, value, type, tags, confidence, created_at, updated_at, access_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    ON CONFLICT(key) DO UPDATE SET
      value = ?,
      type = COALESCE(NULLIF(?, ''), context.type),
      tags = ?,
      confidence = ?,
      updated_at = ?,
      access_count = access_count + 1
  `).run(
    key, value, opts.type ?? 'note', JSON.stringify(opts.tags ?? []), opts.confidence ?? 0.5,
    now, now,
    value, opts.type ?? '', JSON.stringify(opts.tags ?? []), opts.confidence ?? 0.5, now,
  );
}

/** Retrieve a context entry by key. */
export function queryContext(key: string): ContextEntry | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM context WHERE key = ?').get(key) as ContextEntry | undefined;
  if (!row) return null;

  // Bump access count
  db.prepare('UPDATE context SET access_count = access_count + 1, updated_at = ? WHERE key = ?')
    .run(Date.now(), key);

  return row;
}

/** Search context entries by key prefix or tag. */
export function searchContext(query: string, limit = 10): ContextEntry[] {
  const db = getDb();
  const like = `%${query.toLowerCase()}%`;
  const rows = db.prepare(`
    SELECT * FROM context
    WHERE LOWER(key) LIKE ? OR LOWER(value) LIKE ? OR LOWER(tags) LIKE ?
    ORDER BY updated_at DESC LIMIT ?
  `).all(like, like, like, limit) as ContextEntry[];

  return rows;
}

/** List all context entries, optionally filtered by type. */
export function listContexts(type?: string): ContextEntry[] {
  const db = getDb();
  let rows: ContextEntry[];
  if (type) {
    rows = db.prepare('SELECT * FROM context WHERE type = ? ORDER BY updated_at DESC').all(type) as ContextEntry[];
  } else {
    rows = db.prepare('SELECT * FROM context ORDER BY updated_at DESC LIMIT 100').all() as ContextEntry[];
  }
  return rows;
}

/** Delete a context entry. */
export function deleteContext(key: string): void {
  const db = getDb();
  db.prepare('DELETE FROM context WHERE key = ?').run(key);
}

/** Get memory stats for dashboard. */
export function getContextStats(): { total: number; byType: Record<string, number> } {
  const db = getDb();
  const total = (db.prepare('SELECT COUNT(*) as c FROM context').get() as { c: number }).c;
  const typeRows = db.prepare('SELECT type, COUNT(*) as c FROM context GROUP BY type').all() as { type: string; c: number }[];
  const byType: Record<string, number> = {};
  for (const r of typeRows) byType[r.type] = r.c;
  return { total, byType };
}
