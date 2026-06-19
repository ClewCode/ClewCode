/**
 * Cross-Session Memory — redirected to MemoryDB.
 *
 * Session records are stored as `note` memories with key `session.<session_id>`.
 * Timeline queries read from MemoryDB via timeline.ts.
 */

import { getOriginalCwd } from '../../bootstrap/state.js';
import { MemoryDB } from '../../memory/database.js';

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
  } catch {
    /* ignore */
  }
}
