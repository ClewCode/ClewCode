import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryDB } from './database.js';
import { importRecordsInto } from './peerSync.js';

describe('peerSync importRecordsInto', () => {
  let db: MemoryDB;

  beforeEach(() => {
    MemoryDB.reset();
    db = MemoryDB.init(':memory:');
  });

  afterEach(() => {
    MemoryDB.reset();
  });

  it('imports valid records with a confidence discount and provenance event', () => {
    const result = importRecordsInto(
      db,
      [{ type: 'decision', content: 'use bun for builds', importance: 0.8, confidence: 1.0 }],
      'peer-host',
      '/local/project',
    );

    expect(result).toEqual({ fetched: 1, imported: 1, reinforced: 0, skipped: 0 });
    const mems = db.queryMemories({ projectPath: '/local/project' });
    expect(mems).toHaveLength(1);
    expect(mems[0]!.confidence).toBeCloseTo(0.8, 5); // 1.0 × 0.8 discount
    expect(mems[0]!.importance).toBeCloseTo(0.8, 5);
    const timeline = db.getTimeline(mems[0]!.id);
    expect(timeline.some(e => e.event === 'synced' && e.note?.includes('peer-host'))).toBe(true);
  });

  it('reinforces duplicates instead of creating copies (idempotent re-sync)', () => {
    const records = [{ type: 'note', content: 'gotcha: js shadows ts', importance: 0.5, confidence: 0.5 }];
    importRecordsInto(db, records, 'peer-host', '/p');
    const second = importRecordsInto(db, records, 'peer-host', '/p');

    expect(second.imported).toBe(0);
    expect(second.reinforced).toBe(1);
    expect(db.getStats().total).toBe(1);
  });

  it('skips invalid records (bad type, empty/oversized content, garbage)', () => {
    const result = importRecordsInto(
      db,
      [
        { type: 'not-a-type', content: 'x' },
        { type: 'note', content: '' },
        { type: 'note', content: 'y'.repeat(5000) },
        null,
        'string',
        { type: 'note', content: 'valid one' },
      ],
      'peer-host',
      '/p',
    );

    expect(result.skipped).toBe(5);
    expect(result.imported).toBe(1);
  });

  it('clamps out-of-range importance/confidence values', () => {
    importRecordsInto(db, [{ type: 'note', content: 'clamped', importance: 99, confidence: -5 }], 'peer', '/p');
    const mem = db.queryMemories({ projectPath: '/p' })[0]!;
    expect(mem.importance).toBe(1);
    expect(mem.confidence).toBe(0);
  });
});
