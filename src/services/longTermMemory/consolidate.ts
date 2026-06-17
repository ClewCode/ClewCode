/**
 * Memory Consolidation — redirected to MemoryDB.
 *
 * Old sessions are now stored in MemoryDB as note memories with
 * key prefix "session.". Dream handles periodic consolidation.
 */

import { MemoryDB } from '../../memory/database.js';

export function getConsolidationCandidates(_projectRoot: string): Array<{
  week: string;
  sessions: Array<{ session_id: string; summary: string; key_decisions: string; active_files: string }>;
  total: number;
}> {
  if (!MemoryDB.isInitialized()) return [];
  try {
    const memories = MemoryDB.getInstance().recallMemories({ query: 'session.', limit: 200 });
    const weeks = new Map<string, Array<{ session_id: string; summary: string; key_decisions: string; active_files: string }>>();

    for (const m of memories) {
      const date = (m.createdAt ?? '').slice(0, 10);
      if (!date) continue;
      const d = new Date(date);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      const week = weekStart.toISOString().slice(0, 10);

      if (!weeks.has(week)) weeks.set(week, []);
      weeks.get(week)!.push({
        session_id: m.key?.replace(/^session\./, '') ?? m.id,
        summary: m.content.slice(0, 200),
        key_decisions: '[]',
        active_files: '[]',
      });
    }

    return Array.from(weeks.entries())
      .map(([week, sessions]) => ({ week, sessions, total: sessions.length }))
      .filter(g => g.total > 0)
      .sort((a, b) => b.week.localeCompare(a.week));
  } catch {
    return [];
  }
}

export function saveConsolidatedDigest(
  _projectRoot: string,
  week: string,
  type: string,
  summary: string,
  patterns: string[],
  sessionIds: string[],
): void {
  if (!MemoryDB.isInitialized()) return;
  try {
    const db = MemoryDB.getInstance();
    db.upsertMemory({
      key: `digest.${type}.${week}`,
      projectPath: process.cwd(),
      type: 'note',
      content: [`${type} digest: ${week}`, `Summary: ${summary}`, patterns.length > 0 ? `Patterns: ${patterns.join(', ')}` : '', `Sessions: ${sessionIds.length}`].filter(Boolean).join('\n'),
      importance: 0.65,
      confidence: 0.7,
    });
  } catch { /* */ }
}

export function previewConsolidation(projectRoot: string): string {
  const groups = getConsolidationCandidates(projectRoot);
  if (!groups.length) return 'No sessions to consolidate.';
  return groups.map(g => `Week ${g.week}: ${g.total} sessions`).join('\n');
}
