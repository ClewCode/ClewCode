/**
 * Timeline — chronological session + digest history.
 *
 * Shows both raw sessions (recent) and consolidated digests (old).
 */

import { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js';
import type { SessionRecord } from './crossSession.js';

function getDb(projectRoot: string): Database | null {
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

export function queryTimeline(
  projectRoot: string,
  opts: { since?: string; until?: string; limit?: number } = {},
): TimelineRow[] {
  const db = getDb(projectRoot);
  if (!db) return [];

  let sql = `SELECT date(datetime(end_time / 1000, 'unixepoch')) as date,
           session_id, summary, key_decisions, active_files, tags, model, end_time, consolidated
    FROM sessions WHERE 1=1`;
  const bindings: (string | number)[] = [];

  if (opts.since) { sql += ' AND end_time >= ?'; bindings.push(new Date(opts.since).getTime()); }
  if (opts.until) { sql += ' AND end_time <= ?'; bindings.push(new Date(opts.until + 'T23:59:59').getTime()); }

  sql += ` ORDER BY end_time DESC LIMIT ${opts.limit ?? 50}`;

  const rows = db.prepare(sql).all(...bindings) as TimelineRow[];

  db.close();
  return rows;
}

export function formatTimeline(rows: TimelineRow[]): string {
  if (!rows.length) return 'No sessions yet.';
  const out: string[] = ['## Session Timeline\n'];
  let cur = '';
  for (const r of rows) {
    if (r.date !== cur) { cur = r.date; out.push(`\n### ${cur}\n`); }
    const dcs: string[] = JSON.parse(r.key_decisions || '[]');
    const labels = r.consolidated === 0 ? '' : r.consolidated === 1 ? ' [weekly digest]' : ' [monthly digest]';
    out.push(`- **${r.model}${labels}** — ${(r.summary || '').slice(0, 150)}`);
    if (dcs.length) out.push(`  Decisions: ${dcs.join(', ')}`);
  }
  return out.join('\n');
}

export function formatDigests(projectRoot: string): string {
  const db = getDb(projectRoot);
  if (!db) return 'No digests yet.';

  const rows = db.prepare(`
    SELECT * FROM digests ORDER BY created_at DESC LIMIT 12
  `).all() as Array<{ period: string; type: string; summary: string; patterns: string; session_count: number }>;

  db.close();
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
}

export interface DensityStats {
  total: number; byDay: { date: string; count: number }[];
  lastSession: string | null; firstSession: string | null; avgPerDay: number;
}

export function computeDensity(projectRoot: string): DensityStats {
  const db = getDb(projectRoot);
  if (!db) return { total: 0, byDay: [], lastSession: null, firstSession: null, avgPerDay: 0 };

  const total = (db.prepare('SELECT COUNT(*) as c FROM sessions').get() as { c: number }).c;

  const cutoff = Date.now() - 30 * 86_400_000;
  const byDay = db.prepare(`
    SELECT date(datetime(end_time / 1000, 'unixepoch')) as date, COUNT(*) as count
    FROM sessions WHERE end_time > ? GROUP BY date ORDER BY date DESC
  `).all(cutoff) as { date: string; count: number }[];

  const last = db.prepare(`SELECT datetime(end_time / 1000, 'unixepoch') as d FROM sessions ORDER BY end_time DESC LIMIT 1`).get() as { d: string } | undefined;
  const first = db.prepare(`SELECT datetime(end_time / 1000, 'unixepoch') as d FROM sessions ORDER BY end_time ASC LIMIT 1`).get() as { d: string } | undefined;

  db.close();
  let avgPerDay = 0;
  if (first && last) {
    const days = (new Date(last.d).getTime() - new Date(first.d).getTime()) / 86_400_000;
    avgPerDay = days > 0 ? total / days : total;
  }
  return { total, byDay, lastSession: last?.d ?? null, firstSession: first?.d ?? null, avgPerDay: Math.round(avgPerDay * 10) / 10 };
}
