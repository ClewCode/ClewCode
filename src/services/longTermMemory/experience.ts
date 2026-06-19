/**
 * Experience Layer — redirected to MemoryDB importance/confidence.
 */

import { MemoryDB } from '../../memory/database.js';

export function awardNodeXP(_pr: string, _nodeId: string, _xp: number): void {
  // XP is now equivalent to importance in MemoryDB
  if (!MemoryDB.isInitialized()) return;
  try {
    const db = MemoryDB.getInstance();
    db.updateImportance(_nodeId, _xp * 0.01);
  } catch {
    /* */
  }
}
