/**
 * Cross-Session Memory — redirected to MemoryDB.
 *
 * Session records are stored as `note` memories with key `session.<session_id>`.
 * Timeline queries read from MemoryDB via timeline.ts.
 */

import { MemoryDB } from '../../memory/database.js';
import { getOriginalCwd } from '../../bootstrap/state.js';

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
  consolidated: number;
}

function getProjectPath(): string {
  try {
    return getOriginalCwd();
  } catch {
    return process.cwd();
  }
}

/** Get previous session context (injects into new session prompt). */
export function getPreviousSessionContext(_projectRoot: string): string | null {
  if (!MemoryDB.isInitialized()) return null;
  try {
    const memories = MemoryDB.getInstance().recallMemories({ query: 'session.', limit: 3 });
    if (memories.length === 0) return null;
    return memories.map(m => `- ${m.content.slice(0, 200)}`).join('\n');
  } catch {
    return null;
  }
}

/** Get session history for display. */
export function getSessionHistory(_projectRoot: string, opts?: { limit?: number }): SessionRecord[] {
  if (!MemoryDB.isInitialized()) return [];
  try {
    const memories = MemoryDB.getInstance().recallMemories({
      query: 'session.',
      limit: opts?.limit ?? 20,
    });
    return memories.map((m, i) => ({
      session_id: m.key?.replace(/^session\./, '') ?? `mem_${i}`,
      start_time: m.createdAt ? new Date(m.createdAt).getTime() - 3600000 : Date.now() - 3600000,
      end_time: m.createdAt ? new Date(m.createdAt).getTime() : Date.now(),
      model: 'memory',
      provider: 'clew',
      summary: m.content.slice(0, 200),
      key_decisions: '[]',
      active_files: '[]',
      tags: '[]',
      consolidated: 0,
    }));
  } catch {
    return [];
  }
}

/** Save a session summary. */
export function saveSessionSummary(
  _projectRoot: string,
  summary: string,
  decisions: string[],
  files: string[],
  tags: string[],
  model?: string,
  provider?: string,
): void {
  if (!MemoryDB.isInitialized()) return;
  try {
    const { v4: uuid } = { v4: () => `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` };
    const sessionId = uuid();
    const parts = [
      `Session: ${summary}`,
      decisions.length > 0 ? `Decisions: ${decisions.join(', ')}` : '',
      files.length > 0 ? `Files: ${files.join(', ')}` : '',
      model ? `Model: ${model}` : '',
    ];
    if (tags.length > 0) parts.push(`Tags: ${tags.join(', ')}`);
    const content = parts.filter(Boolean).join('\n');

    const db = MemoryDB.getInstance();
    db.upsertMemory({
      key: `session.${sessionId}`,
      projectPath: getProjectPath(),
      type: 'note',
      content,
      importance: 0.5,
      confidence: 0.6,
    });
    db.logEvent({ memoryId: db.findByKey(`session.${sessionId}`)!.id, event: 'session_saved' });
  } catch { /* ignore */ }
}
