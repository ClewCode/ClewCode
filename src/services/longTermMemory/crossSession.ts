/**
 * Cross-Session Memory — persists key context across Clew Code sessions.
 *
 * Like human memory:
 * - Recent sessions: รายละเอียดชัดเจน (keep last 7 days raw)
 * - Old sessions: สรุปเป็น weekly/monthly digest
 * -远古: เก็บแต่ pattern สำคัญ, ปล่อยรายละเอียด
 */

import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { getSessionId } from '../../bootstrap/state.js';
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js';

export interface SessionRecord {
  session_id: string;
  start_time: number;
  end_time: number;
  model: string;
  provider: string;
  summary: string;
  key_decisions: string;
  active_files: string;
  tags: string;
  consolidated: number; // 0=raw, 1=weekly, 2=monthly
}

// ── DB ──

function getDb(projectRoot: string): Database {
  const dir = join(getClaudeConfigHomeDir(), 'projects', sanitize(projectRoot));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const db = new Database(join(dir, 'session-memory.db'), { create: true });
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA synchronous = NORMAL');

  db.run(`CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    start_time INTEGER NOT NULL,
    end_time INTEGER NOT NULL,
    model TEXT DEFAULT '',
    provider TEXT DEFAULT '',
    summary TEXT DEFAULT '',
    key_decisions TEXT DEFAULT '[]',
    active_files TEXT DEFAULT '[]',
    tags TEXT DEFAULT '[]',
    consolidated INTEGER DEFAULT 0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS topic_index (
    topic TEXT NOT NULL, session_id TEXT NOT NULL, PRIMARY KEY(topic, session_id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS digests (
    period TEXT NOT NULL,     -- '2026-W24' or '2026-06'
    type TEXT NOT NULL,       -- 'weekly' or 'monthly'
    summary TEXT DEFAULT '',
    key_decisions TEXT DEFAULT '[]',
    patterns TEXT DEFAULT '[]',  -- recurring patterns noticed
    session_count INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    PRIMARY KEY(period, type)
  )`);

  db.run('CREATE INDEX IF NOT EXISTS idx_sessions_end ON sessions(end_time DESC)');
  db.run('CREATE INDEX IF NOT EXISTS idx_sessions_consolidated ON sessions(consolidated)');
  db.run('CREATE INDEX IF NOT EXISTS idx_digests_period ON digests(period DESC)');

  return db;
}

function sanitize(p: string): string {
  return p.replace(/[\\/:*?"<>|]/g, '_').replace(/^_+|_+$/g, '');
}

// ── Public API ──

/** Get previous session context (injects into new session prompt). */
export function getPreviousSessionContext(projectRoot: string): string | null {
  const db = getDb(projectRoot);

  // Last raw session (< 7 days)
  const last = db
    .prepare(`
    SELECT * FROM sessions WHERE consolidated = 0 ORDER BY end_time DESC LIMIT 1
  `)
    .get() as SessionRecord | undefined;

  // Recent digests (last 4 weeks)
  const digests = db
    .prepare(`
    SELECT * FROM digests ORDER BY created_at DESC LIMIT 4
  `)
    .all() as Array<{ period: string; type: string; summary: string; patterns: string; session_count: number }>;

  // Recent topics
  const topics = db
    .prepare(`
    SELECT DISTINCT t.topic FROM topic_index t
    JOIN sessions s ON t.session_id = s.session_id
    WHERE s.end_time > ? ORDER BY s.end_time DESC LIMIT 8
  `)
    .all(Date.now() - 7 * 86_400_000) as { topic: string }[];

  const total = (db.prepare('SELECT COUNT(*) as c FROM sessions').get() as { c: number }).c;
  db.close();

  if (!last && !digests.length) return null;

  const out: string[] = ['<previous_session_context>'];

  // Recent session detail
  if (last) {
    const dcs: string[] = JSON.parse(last.key_decisions || '[]');
    out.push(`Last session (${ago(last.end_time)}): ${last.summary || ''}`);
    if (dcs.length) out.push(`Decisions: ${dcs.join(', ')}`);
  }

  // Weekly/monthly digests (consolidated memory)
  if (digests.length) {
    out.push('');
    out.push('### Consolidated Memory');
    for (const d of digests) {
      const pats: string[] = JSON.parse(d.patterns || '[]');
      out.push(`- ${d.type} ${d.period}: ${d.summary?.slice(0, 200) || ''} (${d.session_count} sessions)`);
      if (pats.length) out.push(`  Patterns: ${pats.join(', ')}`);
    }
  }

  if (topics.length) out.push(`\nRecent topics: ${topics.map(t => t.topic).join(', ')}`);
  out.push(`Total sessions: ${total}`);
  out.push('</previous_session_context>');
  out.push('<system-reminder>Previous session context — may be stale. Verify before acting.</system-reminder>');

  return out.join('\n');
}

/** Save session summary and trigger consolidation if needed. */
export function saveSessionSummary(
  projectRoot: string,
  summary: string,
  keyDecisions: string[],
  activeFiles: string[],
  tags: string[],
): void {
  const db = getDb(projectRoot);
  const now = Date.now();

  // Insert session
  db.prepare(`
    INSERT INTO sessions (session_id, start_time, end_time, model, provider, summary, key_decisions, active_files, tags, consolidated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `).run(
    getSessionId(),
    now - 3600_000,
    now,
    process.env.AI_PROVIDER ?? 'unknown',
    process.env.AI_PROVIDER ?? 'unknown',
    summary.slice(0, 2000),
    JSON.stringify(keyDecisions),
    JSON.stringify(activeFiles),
    JSON.stringify(tags),
  );

  // Update topics
  const ins = db.prepare('INSERT OR IGNORE INTO topic_index (topic, session_id) VALUES (?, ?)');
  for (const t of tags) ins.run(t.toLowerCase(), getSessionId());

  // Trigger consolidation check
  consolidateIfNeeded(db, now);

  // Keep max 50 raw sessions
  db.prepare(`DELETE FROM sessions WHERE consolidated = 0 AND session_id NOT IN
    (SELECT session_id FROM sessions WHERE consolidated = 0 ORDER BY end_time DESC LIMIT 50)`).run();

  db.close();
}

// ── Consolidation (like human memory decay + summary) ──

const ONE_WEEK = 7 * 86_400_000;
const ONE_MONTH = 30 * 86_400_000;

function consolidateIfNeeded(db: Database, now: number): void {
  // Find sessions older than 7 days that aren't consolidated
  const oldSessions = db
    .prepare(`
    SELECT * FROM sessions WHERE consolidated = 0 AND end_time < ?
    ORDER BY end_time ASC
  `)
    .all(now - ONE_WEEK) as SessionRecord[];

  if (!oldSessions.length) return;

  // Group by ISO week
  const byWeek = new Map<string, SessionRecord[]>();
  const byMonth = new Map<string, SessionRecord[]>();

  for (const s of oldSessions) {
    const d = new Date(s.end_time);
    const week = `W${getWeekNumber(d)}`;
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!byWeek.has(week)) byWeek.set(week, []);
    byWeek.get(week)!.push(s);
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month)!.push(s);
  }

  const now_dt = new Date(now);

  // Create weekly digests
  for (const [week, sessions] of byWeek) {
    const summaries = sessions.map(s => s.summary).filter(Boolean);
    const allDecisions: string[] = [];
    const allTags: string[] = [];
    for (const s of sessions) {
      allDecisions.push(...JSON.parse(s.key_decisions || '[]'));
      allTags.push(...JSON.parse(s.tags || '[]'));
    }

    const digestSummary = summaries.length
      ? `Week ${week}: ${summaries.join('; ')}`.slice(0, 2000)
      : `Week ${week}: ${sessions.length} sessions`;
    const patterns = findPatterns(allTags, allDecisions);

    db.prepare(`
      INSERT OR REPLACE INTO digests (period, type, summary, key_decisions, patterns, session_count, created_at)
      VALUES (?, 'weekly', ?, ?, ?, ?, ?)
    `).run(
      week,
      digestSummary,
      JSON.stringify([...new Set(allDecisions)]),
      JSON.stringify(patterns),
      sessions.length,
      now,
    );

    // Mark as weekly-consolidated
    for (const s of sessions) {
      db.prepare('UPDATE sessions SET consolidated = 1 WHERE session_id = ?').run(s.session_id);
    }
  }

  // Create monthly digests from weekly digests + remaining
  const _monthStr = `${now_dt.getFullYear()}-${String(now_dt.getMonth() + 1).padStart(2, '0')}`;
  const prevMonthSessions = db
    .prepare(`
    SELECT * FROM sessions WHERE consolidated = 1 AND end_time < ?
  `)
    .all(now - ONE_MONTH) as SessionRecord[];

  if (prevMonthSessions.length > 0) {
    // Group by month
    const byMonthMap = new Map<string, SessionRecord[]>();
    for (const s of prevMonthSessions) {
      const d = new Date(s.end_time);
      const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!byMonthMap.has(m)) byMonthMap.set(m, []);
      byMonthMap.get(m)!.push(s);
    }

    for (const [month, sessions] of byMonthMap) {
      const existingDigest = db.prepare('SELECT * FROM digests WHERE period = ? AND type = ?').get(month, 'monthly');
      if (existingDigest) continue; // Already has monthly digest

      const summaries = sessions.map(s => s.summary).filter(Boolean);
      const allTags: string[] = [];
      for (const s of sessions) allTags.push(...JSON.parse(s.tags || '[]'));

      db.prepare(`
        INSERT OR REPLACE INTO digests (period, type, summary, key_decisions, patterns, session_count, created_at)
        VALUES (?, 'monthly', ?, '[]', ?, ?, ?)
      `).run(
        month,
        `Monthly summary: ${summaries.length} sessions. ${summaries.join('; ')}`.slice(0, 2000),
        JSON.stringify(findPatterns(allTags, [])),
        sessions.length,
        now,
      );

      // Mark as monthly-consolidated
      for (const s of sessions) {
        db.prepare('UPDATE sessions SET consolidated = 2 WHERE session_id = ?').run(s.session_id);
      }
    }
  }
}

/** Find recurring patterns from tags + decisions. */
function findPatterns(tags: string[], decisions: string[]): string[] {
  const freq: Record<string, number> = {};
  for (const t of tags) freq[t.toLowerCase()] = (freq[t.toLowerCase()] || 0) + 1;
  for (const d of decisions) {
    const words = d.toLowerCase().split(/\s+/);
    for (const w of words) {
      if (w.length > 4) freq[w] = (freq[w] || 0) + 1;
    }
  }
  return Object.entries(freq)
    .filter(([, c]) => c >= 2)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([w]) => w);
}

// ── Getters ──

export function getSessionHistory(projectRoot: string, limit = 20): SessionRecord[] {
  const db = getDb(projectRoot);
  const rows = db.prepare('SELECT * FROM sessions ORDER BY end_time DESC LIMIT ?').all(limit) as SessionRecord[];
  db.close();
  return rows;
}

export function getDigests(
  projectRoot: string,
): Array<{ period: string; type: string; summary: string; patterns: string; session_count: number }> {
  const db = getDb(projectRoot);
  const rows = db.prepare('SELECT * FROM digests ORDER BY created_at DESC LIMIT 12').all() as any[];
  db.close();
  return rows;
}

// ── Helpers ──

function ago(ms: number): string {
  const d = Date.now() - ms;
  if (d < 60000) return 'just now';
  if (d < 3600_000) return `${Math.floor(d / 60000)}m ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3600_000)}h ago`;
  return `${Math.floor(d / 86_400_000)}d ago`;
}

function getWeekNumber(d: Date): string {
  const start = new Date(d.getFullYear(), 0, 1);
  const diff = d.getTime() - start.getTime();
  const week = Math.ceil((diff / 86_400_000 + start.getDay() + 1) / 7);
  return `${d.getFullYear()}-${String(week).padStart(2, '0')}`;
}
