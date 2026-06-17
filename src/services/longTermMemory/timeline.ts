/**
 * Timeline — chronological session + digest history.
 *
 * Reads primarily from MemoryDB (SQLite store). Falls back to the
 * old session-memory.db for compat during migration.
 */

import { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js';
import { MemoryDB } from '../../memory/database.js';

function getLegacyDb(projectRoot: string): Database | null {
  const dir = join(getClaudeConfigHomeDir(), 'projects', sanitize(projectRoot));
  const dbPath = join(dir, 'session-memory.db');
  if (!existsSync(dbPath)) return null;
  return new Database(dbPath);
}

function sanitize(p: string): string {
  return p.replace(/[\\/:*?"<>|]/g, '_').replace(/^_+|_+$/g, '');
}

export interface TimelineRow {
  date: string;
  session_id: string;
  summary: string;
  key_decisions: string;
  active_files: string;
  tags: string;
  model: string;
  end_time: number;
  consolidated: number;
}

/**
 * Query session history — primary source is MemoryDB, fallback to legacy DB.
 */
export function queryTimeline(
  projectRoot: string,
  opts: { since?: string; until?: string; limit?: number } = {},
): TimelineRow[] {
  // Try MemoryDB first
  const memoryRows = queryMemoryTimeline(projectRoot, opts);
  if (memoryRows.length > 0) return memoryRows;

  // Fallback to legacy session-memory.db
  return queryLegacyTimeline(projectRoot, opts);
}

function queryMemoryTimeline(
  projectRoot: string,
  opts: { since?: string; until?: string; limit?: number } = {},
): TimelineRow[] {
  if (!MemoryDB.isInitialized()) return [];

  try {
    const db = MemoryDB.getInstance();
    const limit = opts.limit ?? 50;

    // Get session memories (key prefix "session.")
    const memories = db.recallMemories({ query: 'session.', limit: 50 });
    const rows: TimelineRow[] = [];

    for (const m of memories) {
      if (!m.content) continue;

      // Parse session_id from key: "session.<session_id>"
      const sessionId = m.key?.replace(/^session\./, '') ?? m.id;
      const dateStr = m.createdAt?.slice(0, 10) ?? 'unknown';
      const lines = m.content.split('\n');

      // Extract summary (first non-empty line after "Session: ")
      const summaryLine = lines.find(l => l.startsWith('Session:'));
      const summary = summaryLine ? summaryLine.replace(/^Session:\s*/, '') : lines[0] ?? '';

      // Extract decisions
      const decisionLine = lines.find(l => l.startsWith('Decisions:'));
      const decisions = decisionLine ? decisionLine.replace(/^Decisions:\s*/, '') : '';

      // Extract files
      const filesLine = lines.find(l => l.startsWith('Files:'));
      const files = filesLine ? filesLine.replace(/^Files:\s*/, '') : '';

      // Extract model
      const modelLine = lines.find(l => l.startsWith('Model:'));
      const model = modelLine ? modelLine.replace(/^Model:\s*/, '') : 'unknown';

      rows.push({
        date: dateStr,
        session_id: sessionId,
        summary: summary.slice(0, 200),
        key_decisions: decisions ? JSON.stringify(decisions.split(', ').filter(Boolean)) : '[]',
        active_files: files ? JSON.stringify(files.split(', ').filter(Boolean)) : '[]',
        tags: '[]',
        model,
        end_time: m.createdAt ? new Date(m.createdAt).getTime() : Date.now(),
        consolidated: 0,
      });
    }

    return rows.sort((a, b) => b.end_time - a.end_time).slice(0, limit);
  } catch {
    return [];
  }
}

function queryLegacyTimeline(
  projectRoot: string,
  opts: { since?: string; until?: string; limit?: number } = {},
): TimelineRow[] {
  const db = getLegacyDb(projectRoot);
  if (!db) return [];

  try {
    let sql = `SELECT date(datetime(end_time / 1000, 'unixepoch')) as date,
               session_id, summary, key_decisions, active_files, tags, model, end_time, consolidated
      FROM sessions WHERE 1=1`;
    const bindings: (string | number)[] = [];

    if (opts.since) {
      sql += ' AND end_time >= ?';
      bindings.push(new Date(opts.since).getTime());
    }
    if (opts.until) {
      sql += ' AND end_time <= ?';
      bindings.push(new Date(`${opts.until}T23:59:59`).getTime());
    }

    sql += ` ORDER BY end_time DESC LIMIT ${opts.limit ?? 50}`;

    return db.prepare(sql).all(...bindings) as TimelineRow[];
  } finally {
    db.close();
  }
}

export function formatTimeline(rows: TimelineRow[]): string {
  if (!rows.length) return 'No sessions yet.';
  const out: string[] = ['## Session Timeline\n'];
  let cur = '';
  for (const r of rows) {
    if (r.date !== cur) {
      cur = r.date;
      out.push(`\n### ${cur}\n`);
    }
    const dcs: string[] = JSON.parse(r.key_decisions || '[]');
    const labels = r.consolidated === 0 ? '' : r.consolidated === 1 ? ' [weekly digest]' : ' [monthly digest]';
    out.push(`- **${r.model}${labels}** — ${(r.summary || '').slice(0, 150)}`);
    if (dcs.length) out.push(`  Decisions: ${dcs.join(', ')}`);
  }
  return out.join('\n');
}

export function formatDigests(projectRoot: string): string {
  // Try MemoryDB for digest memories
  if (MemoryDB.isInitialized()) {
    try {
      const db = MemoryDB.getInstance();
      const digestMemories = db
        .recallMemories({ query: 'digest.', limit: 12 })
        .filter(m => m.key?.startsWith('digest.'));

      if (digestMemories.length > 0) {
        const out: string[] = ['## Consolidated Memory\n'];
        for (const m of digestMemories) {
          const lines = m.content.split('\n');
          const summaryLine = lines.find(l => l.startsWith('Summary:'));
          const patternsLine = lines.find(l => l.startsWith('Patterns:'));
          const sessionsLine = lines.find(l => l.startsWith('Sessions:'));

          out.push(`### ${m.key?.replace(/^digest\./, '') ?? 'digest'}`);
          if (summaryLine) out.push(`- ${summaryLine.replace(/^Summary:\s*/, '')}`);
          if (patternsLine) out.push(`- Recurring patterns: ${patternsLine.replace(/^Patterns:\s*/, '')}`);
          if (sessionsLine) out.push(`- ${sessionsLine}`);
          out.push('');
        }
        return out.join('\n');
      }
    } catch {
      // fall through to legacy
    }
  }

  // Fallback to legacy digests
  const db = getLegacyDb(projectRoot);
  if (!db) return 'No digests yet.';

  try {
    const rows = db
      .prepare(
        `SELECT period, type, summary, patterns, session_count FROM digests ORDER BY created_at DESC LIMIT 12`,
      )
      .all() as Array<{ period: string; type: string; summary: string; patterns: string; session_count: number }>;

    if (!rows.length) return 'No digests yet.';

    const out: string[] = ['## Consolidated Memory\n'];
    for (const r of rows) {
      const pats: string[] = JSON.parse(r.patterns || '[]');
      out.push(`### ${r.type}: ${r.period}`);
      out.push(`- ${r.summary?.slice(0, 300)}`);
      out.push(`- Sessions: ${r.session_count}`);
      if (pats.length) out.push(`- Recurring patterns: ${pats.join(', ')}`);
      out.push('');
    }
    return out.join('\n');
  } finally {
    db.close();
  }
}

export interface DensityStats {
  total: number;
  byDay: { date: string; count: number }[];
  lastSession: string | null;
  firstSession: string | null;
  avgPerDay: number;
}

export function computeDensity(projectRoot: string): DensityStats {
  // Try MemoryDB first
  if (MemoryDB.isInitialized()) {
    try {
      const db = MemoryDB.getInstance();
      const stats = db.getStats();

      // Get session memories
      const memories = db.recallMemories({ query: 'session.', limit: 1000 });
      const total = memories.length;

      // Compute daily density from session memories
      const dayCount = new Map<string, number>();
      let latest = '';
      let earliest = '';

      for (const m of memories) {
        const date = (m.createdAt ?? '').slice(0, 10);
        if (!date) continue;
        dayCount.set(date, (dayCount.get(date) ?? 0) + 1);
        if (!latest || date > latest) latest = date;
        if (!earliest || date < earliest) earliest = date;
      }

      const byDay = Array.from(dayCount.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 30);

      let avgPerDay = 0;
      if (earliest && latest) {
        const days = (new Date(latest).getTime() - new Date(earliest).getTime()) / 86_400_000;
        avgPerDay = days > 0 ? total / days : total;
      }

      return {
        total,
        byDay,
        lastSession: latest || null,
        firstSession: earliest || null,
        avgPerDay: Math.round(avgPerDay * 10) / 10,
      };
    } catch {
      // fall through
    }
  }

  // Fallback to legacy
  const db = getLegacyDb(projectRoot);
  if (!db) return { total: 0, byDay: [], lastSession: null, firstSession: null, avgPerDay: 0 };

  try {
    const total = (db.prepare('SELECT COUNT(*) as c FROM sessions').get() as { c: number }).c;
    const cutoff = Date.now() - 30 * 86_400_000;
    const byDay = db
      .prepare(
        `SELECT date(datetime(end_time / 1000, 'unixepoch')) as date, COUNT(*) as count
         FROM sessions WHERE end_time > ? GROUP BY date ORDER BY date DESC`,
      )
      .all(cutoff) as { date: string; count: number }[];

    const last = db
      .prepare(`SELECT datetime(end_time / 1000, 'unixepoch') as d FROM sessions ORDER BY end_time DESC LIMIT 1`)
      .get() as { d: string } | undefined;
    const first = db
      .prepare(`SELECT datetime(end_time / 1000, 'unixepoch') as d FROM sessions ORDER BY end_time ASC LIMIT 1`)
      .get() as { d: string } | undefined;

    let avgPerDay = 0;
    if (first && last) {
      const days = (new Date(last.d).getTime() - new Date(first.d).getTime()) / 86_400_000;
      avgPerDay = days > 0 ? total / days : total;
    }
    return {
      total,
      byDay,
      lastSession: last?.d ?? null,
      firstSession: first?.d ?? null,
      avgPerDay: Math.round(avgPerDay * 10) / 10,
    };
  } finally {
    db.close();
  }
}
