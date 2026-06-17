/**
 * Memory Consolidation — AI-powered summarization of old sessions.
 *
 * Flow:
 * 1. User runs /memory consolidate
 * 2. AI gets list of unconsolidated sessions older than 7 days
 * 3. AI summarizes them (via the model)
 * 4. Saves weekly/monthly digests back to original timeline slot
 * 5. Marks sessions as consolidated
 */

import { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js';

interface RawSession {
  session_id: string;
  end_time: number;
  summary: string;
  key_decisions: string;
  active_files: string;
  tags: string;
}

/**
 * Find sessions that need consolidation (>7 days old, not yet consolidated).
 * Returns grouped by ISO week.
 */
export function getConsolidationCandidates(projectRoot: string): {
  week: string;
  sessions: RawSession[];
  total: number;
}[] {
  const db = getDb(projectRoot);
  if (!db) return [];

  const cutoff = Date.now() - 7 * 86_400_000;
  const rows = db
    .prepare(`
    SELECT * FROM sessions WHERE consolidated = 0 AND end_time < ?
    ORDER BY end_time ASC
  `)
    .all(cutoff) as RawSession[];

  db.close();

  // Group by ISO week
  const byWeek = new Map<string, RawSession[]>();
  for (const s of rows) {
    const d = new Date(s.end_time);
    const week = getISOWeek(d);
    if (!byWeek.has(week)) byWeek.set(week, []);
    byWeek.get(week)!.push(s);
  }

  return Array.from(byWeek.entries()).map(([week, sessions]) => ({
    week,
    sessions,
    total: sessions.length,
  }));
}

/**
 * Save a consolidated digest back to the original timeline period.
 * This keeps the timeline intact — just replaces detail with summary.
 */
export function saveConsolidatedDigest(
  projectRoot: string,
  period: string, // ISO week or month
  type: 'weekly' | 'monthly',
  summary: string,
  patterns: string[],
  sessionIds: string[],
): void {
  const db = getDb(projectRoot);
  if (!db) return;

  // Save digest
  const existing = db.prepare('SELECT * FROM digests WHERE period = ? AND type = ?').get(period, type);
  if (existing) {
    // Update existing digest with new summary
    db.prepare(
      'UPDATE digests SET summary = ?, patterns = ?, session_count = ?, created_at = ? WHERE period = ? AND type = ?',
    ).run(summary, JSON.stringify(patterns), sessionIds.length, Date.now(), period, type);
  } else {
    db.prepare(`
      INSERT INTO digests (period, type, summary, key_decisions, patterns, session_count, created_at)
      VALUES (?, ?, ?, '[]', ?, ?, ?)
    `).run(period, type, summary, JSON.stringify(patterns), sessionIds.length, Date.now());
  }

  // Mark sessions as consolidated
  for (const sid of sessionIds) {
    const consType = type === 'monthly' ? 2 : 1;
    db.prepare('UPDATE sessions SET consolidated = ? WHERE session_id = ?').run(consType, sid);
  }

  db.close();
}

/**
 * Preview what consolidation would do (for display before running).
 */
export function previewConsolidation(projectRoot: string): string {
  const groups = getConsolidationCandidates(projectRoot);
  if (!groups.length) return 'No sessions need consolidation.';

  const lines: string[] = ['Sessions ready for consolidation:\n'];
  for (const g of groups) {
    const tags = new Set<string>();
    for (const s of g.sessions) {
      for (const t of JSON.parse(s.tags || '[]')) tags.add(t);
    }
    lines.push(`- Week ${g.week}: ${g.total} sessions`);
    if (tags.size) lines.push(`  Topics: ${[...tags].join(', ')}`);
    lines.push('');
  }
  lines.push(`Total: ${groups.reduce((a, g) => a + g.total, 0)} sessions to consolidate.`);
  return lines.join('\n');
}

// ── Helpers ──

function getDb(projectRoot: string): Database | null {
  const dir = join(getClaudeConfigHomeDir(), 'projects', sanitize(projectRoot));
  const dbPath = join(dir, 'session-memory.db');
  if (!existsSync(dbPath)) return null;
  const db = new Database(dbPath);
  db.run('PRAGMA journal_mode = WAL');
  return db;
}

function sanitize(p: string): string {
  return p.replace(/[\\/:*?"<>|]/g, '_').replace(/^_+|_+$/g, '');
}

function getISOWeek(d: Date): string {
  const tmp = new Date(d.getTime());
  tmp.setHours(0, 0, 0, 0);
  tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
  const week1 = new Date(tmp.getFullYear(), 0, 4);
  const week = 1 + Math.round(((tmp.getTime() - week1.getTime()) / 86_400_000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}
