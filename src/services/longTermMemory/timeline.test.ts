import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { MemoryDB } from '../../memory/database.js';
import { getConsolidationCandidates, previewConsolidation } from './consolidate.js';
import { computeDensity, formatDigests, formatTimeline, queryTimeline } from './timeline.js';

const PROJECT = '/test/project';

/**
 * Session records are written by `crossSession.saveSessionSummary()` as `note`
 * memories whose body starts with `Session: `. These helpers reproduce that
 * on-disk shape so the read side is tested against the real contract.
 */
function sessionBody(summary: string, extras: Partial<Record<'Decisions' | 'Files' | 'Model' | 'Tags', string>> = {}) {
  return [
    `Session: ${summary}`,
    extras.Decisions ? `Decisions: ${extras.Decisions}` : '',
    extras.Files ? `Files: ${extras.Files}` : '',
    extras.Model ? `Model: ${extras.Model}` : '',
    extras.Tags ? `Tags: ${extras.Tags}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function addSession(key: string, body: string): void {
  MemoryDB.getInstance().upsertMemory({
    key,
    projectPath: PROJECT,
    type: 'note',
    content: body,
    importance: 0.5,
    confidence: 0.6,
  });
}

describe('longTermMemory timeline', () => {
  beforeEach(() => {
    MemoryDB.reset();
    MemoryDB.init(':memory:');
  });

  afterEach(() => {
    MemoryDB.reset();
  });

  test('returns an empty timeline when no sessions were recorded', () => {
    expect(queryTimeline(PROJECT)).toEqual([]);
  });

  test('parses summary, decisions, files, tags and model out of a session record', () => {
    addSession(
      'session.a',
      sessionBody('added the parser', {
        Decisions: 'use sqlite, skip the cache',
        Files: 'src/a.ts, src/b.ts',
        Model: 'opus',
        Tags: 'parser, memory',
      }),
    );

    const [row] = queryTimeline(PROJECT);
    expect(row).toBeDefined();
    expect(row!.summary).toBe('added the parser');
    expect(row!.decisions).toEqual(['use sqlite', 'skip the cache']);
    expect(row!.files).toEqual(['src/a.ts', 'src/b.ts']);
    expect(row!.tags).toEqual(['parser', 'memory']);
    expect(row!.model).toBe('opus');
  });

  test('tolerates historical records whose summary was double-prefixed', () => {
    addSession('session.dp', 'Session: Session: built the thing');
    expect(queryTimeline(PROJECT)[0]?.summary).toBe('built the thing');
  });

  test('ignores non-session note memories', () => {
    addSession('session.a', sessionBody('a real session'));
    MemoryDB.getInstance().upsertMemory({
      key: 'note.unrelated',
      projectPath: PROJECT,
      type: 'note',
      content: 'Just a note, not a session',
      importance: 0.5,
      confidence: 0.6,
    });

    expect(queryTimeline(PROJECT)).toHaveLength(1);
  });

  test('honours the limit option', () => {
    for (let i = 0; i < 5; i++) addSession(`session.${i}`, sessionBody(`session ${i}`));
    expect(queryTimeline(PROJECT, { limit: 2 })).toHaveLength(2);
    expect(queryTimeline(PROJECT)).toHaveLength(5);
  });

  test('formatTimeline groups sessions under their day', () => {
    addSession('session.a', sessionBody('did a thing', { Tags: 'x' }));
    const output = formatTimeline(queryTimeline(PROJECT));
    expect(output).toContain('## Session Timeline');
    expect(output).toContain('did a thing');
    expect(output).toContain('tags: x');
  });

  test('computeDensity reports zeroes for an empty project', () => {
    expect(computeDensity(PROJECT)).toEqual({
      total: 0,
      firstSession: null,
      lastSession: null,
      avgPerDay: 0,
      byDay: [],
    });
  });

  test('computeDensity counts recorded sessions', () => {
    addSession('session.a', sessionBody('one'));
    addSession('session.b', sessionBody('two'));

    const density = computeDensity(PROJECT);
    expect(density.total).toBe(2);
    expect(density.firstSession).not.toBeNull();
    expect(density.lastSession).not.toBeNull();
    // Both sessions land today, so they appear in the 30-day window.
    expect(density.byDay.reduce((sum, d) => sum + d.count, 0)).toBe(2);
  });

  test('formatDigests explains how to create digests when none exist', () => {
    const output = formatDigests(PROJECT);
    expect(output).toContain('No digests yet.');
    expect(output).toContain('/memory consolidate');
  });

  test('formatDigests renders stored digests', () => {
    MemoryDB.getInstance().upsertMemory({
      key: 'digest.week1',
      projectPath: PROJECT,
      type: 'note',
      content: 'Digest: shipped the parser and the timeline',
      importance: 0.7,
      confidence: 0.7,
    });

    const output = formatDigests(PROJECT);
    expect(output).toContain('shipped the parser and the timeline');
    expect(output).not.toContain('No digests yet.');
  });
});

describe('longTermMemory consolidation', () => {
  beforeEach(() => {
    MemoryDB.reset();
    MemoryDB.init(':memory:');
  });

  afterEach(() => {
    MemoryDB.reset();
  });

  test('never proposes consolidating the current day', () => {
    // All sessions written by this test carry today's timestamp.
    for (let i = 0; i < 5; i++) addSession(`session.${i}`, sessionBody(`session ${i}`));
    expect(getConsolidationCandidates(PROJECT)).toEqual([]);
  });

  test('preview explains why nothing is ready', () => {
    const output = previewConsolidation(PROJECT);
    expect(output).toContain('## Consolidation Preview');
    expect(output).toContain('No session groups are ready');
  });
});
