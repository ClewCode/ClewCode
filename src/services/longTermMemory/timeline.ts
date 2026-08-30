/**
 * Session Timeline — reads session history out of MemoryDB.
 *
 * `crossSession.saveSessionSummary()` writes each session as a `note` memory
 * keyed `session.<id>` whose content starts with `Session: `. This module is
 * the read side of that contract: it re-parses those records back into
 * structured rows for `/memory timeline`, `/memory stats` and
 * `/memory digests`.
 *
 * Content shape written by saveSessionSummary (blank lines omitted):
 *   Session: <summary>
 *   Decisions: <a>, <b>
 *   Files: <x>, <y>
 *   Model: <model>
 *   Tags: <t1>, <t2>
 */

import { existsSync } from 'node:fs';
import { MemoryDB, type MemoryRecord } from '../../memory/database.js';
import { getMemoryDbPath } from '../../memory/hierarchy.js';

/** Content prefix that marks a `note` memory as a session record. */
const SESSION_PREFIX = 'Session: ';

/** Content prefix that marks a `note` memory as a consolidated digest. */
const DIGEST_PREFIX = 'Digest: ';

/** Days of history shown by the `/memory stats` activity histogram. */
const DENSITY_WINDOW_DAYS = 30;

const MS_PER_DAY = 86_400_000;

export type TimelineRow = {
  id: string;
  summary: string;
  decisions: string[];
  files: string[];
  tags: string[];
  model: string | null;
  createdAt: string;
};

export type SessionDensity = {
  total: number;
  firstSession: string | null;
  lastSession: string | null;
  avgPerDay: number;
  byDay: Array<{ date: string; count: number }>;
};

/**
 * Open the memory DB for reading without creating it.
 *
 * The read-only `/memory` subcommands must not materialize a database as a
 * side effect of being run — callers that legitimately create one (e.g.
 * `/memory rebuild`) go through `initMemoryHierarchy()` first. Returns null
 * when there is nothing to read.
 */
function openForRead(): MemoryDB | null {
  if (MemoryDB.isInitialized()) return MemoryDB.getInstance();
  const dbPath = getMemoryDbPath();
  if (!existsSync(dbPath)) return null;
  try {
    return MemoryDB.init(dbPath);
  } catch {
    return null;
  }
}

/**
 * Pull the `Label: a, b` list out of a session record body. Split on the
 * writer's exact `', '` join so values containing a bare comma survive; a
 * value containing `', '` itself is not recoverable from this format.
 */
function parseListField(lines: string[], label: string): string[] {
  const line = lines.find(l => l.startsWith(`${label}: `));
  if (!line) return [];
  return line
    .slice(label.length + 2)
    .split(', ')
    .map(v => v.trim())
    .filter(Boolean);
}

/**
 * Some historical records were written with the summary already carrying the
 * prefix, yielding `Session: Session: <text>`. Strip every leading copy.
 */
function stripSessionPrefix(line: string): string {
  let text = line;
  while (text.startsWith(SESSION_PREFIX)) text = text.slice(SESSION_PREFIX.length);
  return text.trim();
}

function toTimelineRow(record: MemoryRecord): TimelineRow {
  const lines = record.content.split('\n');
  const model = lines.find(l => l.startsWith('Model: '));
  return {
    id: record.id,
    summary: stripSessionPrefix(lines[0] ?? ''),
    decisions: parseListField(lines, 'Decisions'),
    files: parseListField(lines, 'Files'),
    tags: parseListField(lines, 'Tags'),
    model: model ? model.slice('Model: '.length).trim() : null,
    createdAt: record.createdAt,
  };
}

/** Every session record for a project, newest first. */
function allSessions(projectPath: string): TimelineRow[] {
  const db = openForRead();
  if (!db) return [];
  try {
    return db
      .queryMemories({ projectPath, type: 'note' })
      .filter(m => m.content.startsWith(SESSION_PREFIX))
      .map(toTimelineRow)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

/**
 * Most recent sessions for a project, newest first.
 * Returns an empty array (never throws) when memory is unavailable.
 */
export function queryTimeline(projectPath: string, opts: { limit?: number } = {}): TimelineRow[] {
  const rows = allSessions(projectPath);
  return opts.limit === undefined ? rows : rows.slice(0, opts.limit);
}

/** `2026-08-30T12:00:00.000Z` → `2026-08-30`. */
function toDay(iso: string): string {
  return iso.slice(0, 10);
}

export function formatTimeline(rows: readonly TimelineRow[]): string {
  const lines: string[] = ['## Session Timeline', ''];

  let currentDay: string | null = null;
  for (const row of rows) {
    const day = toDay(row.createdAt);
    if (day !== currentDay) {
      if (currentDay !== null) lines.push('');
      lines.push(`### ${day}`);
      currentDay = day;
    }
    lines.push(`  ${row.summary || '(no summary)'}`);
    if (row.decisions.length > 0) lines.push(`    decisions: ${row.decisions.join(', ')}`);
    if (row.files.length > 0) lines.push(`    files: ${row.files.join(', ')}`);
    if (row.tags.length > 0) lines.push(`    tags: ${row.tags.join(', ')}`);
    if (row.model) lines.push(`    model: ${row.model}`);
  }

  return lines.join('\n');
}

/**
 * Session counts over time. `avgPerDay` is measured across the observed span
 * (first → last session inclusive), not the density window, so a project with
 * a long quiet stretch isn't reported as busier than it was.
 */
export function computeDensity(projectPath: string): SessionDensity {
  const rows = allSessions(projectPath);
  if (rows.length === 0) {
    return { total: 0, firstSession: null, lastSession: null, avgPerDay: 0, byDay: [] };
  }

  // allSessions is newest-first.
  const lastSession = rows[0]!.createdAt;
  const firstSession = rows[rows.length - 1]!.createdAt;

  const spanDays = Math.max(1, Math.ceil((Date.parse(lastSession) - Date.parse(firstSession)) / MS_PER_DAY) || 1);
  const avgPerDay = Math.round((rows.length / spanDays) * 10) / 10;

  const cutoff = Date.now() - DENSITY_WINDOW_DAYS * MS_PER_DAY;
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (Date.parse(row.createdAt) < cutoff) continue;
    const day = toDay(row.createdAt);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }

  const byDay = [...counts.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return { total: rows.length, firstSession, lastSession, avgPerDay, byDay };
}

/**
 * Render consolidated digests. Digests are `note` memories whose content
 * starts with `Digest: `; they are produced by summarizing the session groups
 * that `consolidate.getConsolidationCandidates()` identifies.
 */
export function formatDigests(projectPath: string): string {
  const db = openForRead();
  const digests = db
    ? db
        .queryMemories({ projectPath, type: 'note' })
        .filter(m => m.content.startsWith(DIGEST_PREFIX))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    : [];

  if (digests.length === 0) {
    return [
      '## Memory Digests',
      '',
      'No digests yet.',
      '',
      'Digests summarize groups of related sessions. Run `/memory consolidate`',
      'to see which sessions are ready to be summarized.',
    ].join('\n');
  }

  const lines: string[] = ['## Memory Digests', ''];
  for (const digest of digests) {
    lines.push(`### ${toDay(digest.createdAt)}`);
    lines.push(digest.content.slice(DIGEST_PREFIX.length).trim());
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}
