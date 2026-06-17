/**
 * Dream Status — redirected to MemoryDB.
 *
 * The actual Dream consolidation runs via src/services/autoDream/.
 * This file provides backward-compatible status queries from MemoryDB.
 */

import { MemoryDB } from '../../memory/database.js';
import { getOriginalCwd } from '../../bootstrap/state.js';

function getProjectPath(): string {
  try {
    return getOriginalCwd();
  } catch {
    return process.cwd();
  }
}

export async function getDreamStatus(_projectRoot?: string): Promise<{
  lastDreamAt: number | null;
  dreamsRun: number;
  nextDreamIn: number;
  pendingConsolidations: number;
} | null> {
  if (!MemoryDB.isInitialized()) return null;

  try {
    const db = MemoryDB.getInstance();
    const dreamEvents = db.getRecentTimeline(100).filter(e => e.event === 'dream_completed');
    const lastDreamAt = dreamEvents.length > 0 ? new Date(dreamEvents[0]!.createdAt).getTime() : null;

    // Next dream: if never run → 0, else 7 days from last
    const nextDreamIn = lastDreamAt ? Math.max(0, 7 * 86400000 - (Date.now() - lastDreamAt)) : 0;

    return {
      lastDreamAt,
      dreamsRun: dreamEvents.length,
      nextDreamIn,
      pendingConsolidations: 0,
    };
  } catch {
    return null;
  }
}
