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
  } catch { /* */ }
}

export function getColdNodes(_pr: string, _threshold?: number): string[] {
  if (!MemoryDB.isInitialized()) return [];
  try {
    const all = MemoryDB.getInstance().exportMemories(200);
    const cutoff = Date.now() - 30 * 86400000;
    return all.filter(m => {
      const lastAccess = m.lastAccessedAt ? new Date(m.lastAccessedAt).getTime() : 0;
      return lastAccess < cutoff && m.accessCount < 3;
    }).map(m => m.id);
  } catch { return []; }
}

export function getExpertiseProfile(_pr: string): string {
  if (!MemoryDB.isInitialized()) return 'No expertise data.';
  try {
    const db = MemoryDB.getInstance();
    const stats = db.getStats();
    return `Memory types: ${Object.entries(stats.byType).map(([t,c]) => `${t}: ${c}`).join(', ') || 'none'}`;
  } catch { return 'No expertise data.'; }
}

export function getTopNodes(_pr: string, _n?: number): string[] {
  if (!MemoryDB.isInitialized()) return [];
  try {
    return MemoryDB.getInstance().exportMemories(_n ?? 10).map(m => `${m.type}: ${m.content.slice(0, 100)}`);
  } catch { return []; }
}

export function applyCorrection(_pr: string, _nodeId: string, _correction: string): void {
  if (!MemoryDB.isInitialized()) return;
  try {
    MemoryDB.getInstance().updateConfidence(_nodeId, -0.05);
  } catch { /* */ }
}

export function getExperienceReport(_pr: string): string {
  if (!MemoryDB.isInitialized()) return 'No experiences yet.';
  try {
    const db = MemoryDB.getInstance();
    const stats = db.getStats();
    const top = db.exportMemories(5);
    return [
      `Total memories: ${stats.total}`,
      `By type: ${Object.entries(stats.byType).map(([t,c]) => `${t}: ${c}`).join(', ')}`,
      '',
      'Top memories:',
      ...top.map((m, i) => `${i+1}. [${m.type}] ${m.content.slice(0, 100)} (imp:${m.importance.toFixed(2)}, conf:${m.confidence.toFixed(2)})`),
    ].join('\n');
  } catch { return 'Error loading experience.'; }
}
