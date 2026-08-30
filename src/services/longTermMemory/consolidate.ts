/**
 * Session Consolidation — groups related sessions into digest candidates.
 *
 * Sessions accumulate one `note` memory each (see `crossSession.ts`). Once a
 * day has enough of them, they are better stored as a single summarized
 * digest than as N near-duplicate records. This module identifies those
 * groups; producing the summary text itself is an AI step driven by the
 * caller, so nothing here writes to MemoryDB.
 */

import { queryTimeline, type TimelineRow } from './timeline.js';

/** A day needs at least this many sessions before it is worth summarizing. */
const MIN_SESSIONS_PER_GROUP = 3;

export type ConsolidationGroup = {
  /** `YYYY-MM-DD` the sessions in this group share. */
  date: string;
  /** Number of sessions in the group — callers sum this for a total. */
  total: number;
  sessions: TimelineRow[];
};

/** `2026-08-30T12:00:00.000Z` → `2026-08-30`. */
function toDay(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Day-groups of sessions that are ready to be summarized, newest day first.
 *
 * The current day is excluded — it is still accumulating sessions, and
 * consolidating it would discard records the user is still creating.
 */
export function getConsolidationCandidates(projectPath: string): ConsolidationGroup[] {
  const today = toDay(new Date().toISOString());

  const byDay = new Map<string, TimelineRow[]>();
  for (const session of queryTimeline(projectPath)) {
    const day = toDay(session.createdAt);
    if (day === today) continue;
    const group = byDay.get(day);
    if (group) group.push(session);
    else byDay.set(day, [session]);
  }

  return [...byDay.entries()]
    .filter(([, sessions]) => sessions.length >= MIN_SESSIONS_PER_GROUP)
    .map(([date, sessions]) => ({ date, total: sessions.length, sessions }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function previewConsolidation(projectPath: string): string {
  const groups = getConsolidationCandidates(projectPath);
  if (groups.length === 0) {
    return [
      '## Consolidation Preview',
      '',
      `No session groups are ready. A day needs at least ${MIN_SESSIONS_PER_GROUP} sessions`,
      'before it is worth summarizing, and the current day is never consolidated.',
    ].join('\n');
  }

  const lines: string[] = ['## Consolidation Preview', ''];
  for (const group of groups) {
    lines.push(`### ${group.date} — ${group.total} sessions`);
    for (const session of group.sessions) {
      lines.push(`  ${session.summary || '(no summary)'}`);
    }

    const tags = [...new Set(group.sessions.flatMap(s => s.tags))];
    const files = [...new Set(group.sessions.flatMap(s => s.files))];
    if (tags.length > 0) lines.push(`  tags: ${tags.join(', ')}`);
    if (files.length > 0) lines.push(`  files touched: ${files.length}`);
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}
