import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { appendFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemoryDB } from './database.js';

describe('MemoryDB dedup and prune', () => {
  let db: MemoryDB;
  let tempDir = '';

  beforeEach(() => {
    tempDir = join(tmpdir(), `clew-test-${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
    mkdirSync(join(tempDir, '.clew', 'memory', 'store'), { recursive: true });
    MemoryDB.reset();
    db = MemoryDB.init(join(tempDir, '.clew', 'memory'));
  });

  afterEach(() => {
    MemoryDB.reset();
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup of the temporary test directory.
    }
  });

  it('saveMemory reinforces instead of duplicating identical content', () => {
    const id1 = db.saveMemory({ projectPath: '/p', type: 'note', content: 'use bun for builds', importance: 0.5 });
    const id2 = db.saveMemory({ projectPath: '/p', type: 'note', content: 'use bun for builds', importance: 0.5 });

    expect(id2).toBe(id1);
    expect(db.getStats().total).toBe(1);
    expect(db.getMemory(id1)!.importance).toBeCloseTo(0.55, 5);
    const id3 = db.saveMemory({ projectPath: '/other', type: 'note', content: 'use bun for builds' });
    expect(id3).not.toBe(id1);
    expect(db.getStats().total).toBe(2);
  });

  it('pruneMemories deletes old low-value memories but keeps valuable and keyed ones', () => {
    db.saveMemory({ projectPath: '/p', type: 'note', content: 'stale trivia', importance: 0.2, confidence: 0.2 });
    db.saveMemory({
      projectPath: '/p',
      type: 'decision',
      content: 'important decision',
      importance: 0.9,
      confidence: 0.9,
    });
    db.upsertMemory({
      key: 'scan.protected',
      projectPath: '/p',
      type: 'architecture',
      content: 'low scored but keyed',
      importance: 0.1,
      confidence: 0.1,
    });

    const deleted = db.pruneMemories({ maxAgeDays: 60 });
    expect(deleted).toBe(0);
    expect(db.getStats().total).toBe(3);
  });

  it('pruneMemories keeps recently accessed memories', () => {
    const id = db.saveMemory({
      projectPath: '/p',
      type: 'note',
      content: 'recently used',
      importance: 0.2,
      confidence: 0.2,
    });
    db.getMemory(id);
    expect(db.pruneMemories({ maxAgeDays: 60 })).toBe(0);
    expect(db.getMemory(id)).not.toBeNull();
  });

  it('preserves valid timeline records when the JSONL tail is truncated', () => {
    const id = db.saveMemory({ projectPath: '/p', type: 'note', content: 'timeline survives corruption' });
    const timelinePath = join(tempDir, '.clew', 'memory', 'timeline.jsonl');
    appendFileSync(timelinePath, '{"id":"truncated"', 'utf8');

    const timeline = db.getTimeline(id);
    expect(timeline.length).toBeGreaterThan(0);
    expect(timeline.some(event => event.event === 'created')).toBe(true);
  });
});
