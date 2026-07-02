import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryDB } from './database.js';

describe('MemoryDB dedup and prune', () => {
  let db: MemoryDB;

  beforeEach(() => {
    MemoryDB.reset();
    db = MemoryDB.init(':memory:');
  });

  afterEach(() => {
    MemoryDB.reset();
  });

  it('saveMemory reinforces instead of duplicating identical content', () => {
    const id1 = db.saveMemory({ projectPath: '/p', type: 'note', content: 'use bun for builds', importance: 0.5 });
    const id2 = db.saveMemory({ projectPath: '/p', type: 'note', content: 'use bun for builds', importance: 0.5 });

    expect(id2).toBe(id1);
    expect(db.getStats().total).toBe(1);
    // Importance bumped on reinforcement
    expect(db.getMemory(id1)!.importance).toBeCloseTo(0.55, 5);
    // Different project or type still creates a new memory
    const id3 = db.saveMemory({ projectPath: '/other', type: 'note', content: 'use bun for builds' });
    expect(id3).not.toBe(id1);
    expect(db.getStats().total).toBe(2);
  });

  it('pruneMemories deletes old low-value memories but keeps valuable and keyed ones', () => {
    const oldDate = new Date(Date.now() - 90 * 86400000).toISOString();

    const lowValue = db.saveMemory({
      projectPath: '/p',
      type: 'note',
      content: 'stale trivia',
      importance: 0.2,
      confidence: 0.2,
    });
    const highValue = db.saveMemory({
      projectPath: '/p',
      type: 'decision',
      content: 'important decision',
      importance: 0.9,
      confidence: 0.9,
    });
    const keyed = db.upsertMemory({
      key: 'arch:core',
      projectPath: '/p',
      type: 'architecture',
      content: 'low scored but keyed',
      importance: 0.1,
      confidence: 0.1,
    });

    // Backdate everything so age criteria are met
    // @ts-expect-error — reach into private db handle for test setup
    const raw = db.db;
    raw.prepare('UPDATE memories SET created_at = ?, last_accessed_at = NULL').run(oldDate);

    const deleted = db.pruneMemories({ maxAgeDays: 60 });

    expect(deleted).toBe(1);
    expect(db.getMemory(lowValue)).toBeNull();
    expect(db.getMemory(highValue)).not.toBeNull();
    expect(db.getMemory(keyed.id)).not.toBeNull();
  });

  it('pruneMemories keeps recently accessed memories', () => {
    const id = db.saveMemory({
      projectPath: '/p',
      type: 'note',
      content: 'recently used',
      importance: 0.2,
      confidence: 0.2,
    });
    const oldDate = new Date(Date.now() - 90 * 86400000).toISOString();
    // @ts-expect-error — private handle for test setup
    const raw = db.db;
    raw.prepare('UPDATE memories SET created_at = ? WHERE id = ?').run(oldDate, id);
    // last_accessed_at is recent (getMemory bumps it)
    db.getMemory(id);

    expect(db.pruneMemories({ maxAgeDays: 60 })).toBe(0);
    expect(db.getMemory(id)).not.toBeNull();
  });
});
