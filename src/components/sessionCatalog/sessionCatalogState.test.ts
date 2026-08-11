import { describe, expect, test } from 'bun:test';
import {
  buildCatalogRows,
  buildDisplayItems,
  countRowsBySection,
  filterCatalogSessions,
  formatCatalogRelativeTime,
  formatHeartbeatBadge,
  getCatalogAncestorSessionIds,
  getCatalogDepth,
  hasCatalogChildren,
  reconcileCatalogSessions,
  resolveCatalogScopeFrames,
  resolveCatalogSelectionState,
  scopeToSessionSubtree,
  stepCatalogSelection,
  summaryForRecord,
  transitionCatalogScope,
} from './sessionCatalogState.js';
import type { CatalogSessionSummary, SavedCatalogSession } from './types.js';

function live(overrides: Partial<CatalogSessionSummary> & { id: string }): CatalogSessionSummary {
  return {
    sessionId: overrides.id,
    activeSessionId: overrides.id,
    lifecycle: 'live',
    activity: 'idle',
    runtimeKind: 'top-level',
    cwd: '/repo',
    messageCount: 0,
    source: 'supervisor',
    created: '2026-08-11T10:00:00.000Z',
    modified: '2026-08-11T10:00:00.000Z',
    ...overrides,
  };
}

function saved(overrides: Partial<SavedCatalogSession> & { id: string; path: string }): SavedCatalogSession {
  return {
    cwd: '/repo',
    messageCount: 3,
    created: new Date('2026-08-10T10:00:00.000Z'),
    modified: new Date('2026-08-10T11:00:00.000Z'),
    ...overrides,
  };
}

describe('reconcileCatalogSessions', () => {
  test('classifies live, idle, and archived sessions into sections', () => {
    const records = reconcileCatalogSessions(
      [live({ id: 'a', activity: 'working' }), live({ id: 'b' })],
      [saved({ id: 'c', path: '/logs/c.jsonl' })],
    );
    expect(records.map(record => record.section)).toEqual(['running', 'idle', 'inactive']);
  });

  test('enriches a live session with its transcript instead of duplicating the row', () => {
    const records = reconcileCatalogSessions(
      [live({ id: 'a', sessionId: 'session-a', sessionFile: '/logs/a.jsonl' })],
      [saved({ id: 'session-a', path: '/logs/a.jsonl', name: 'fix auth', messageCount: 12 })],
    );
    expect(records).toHaveLength(1);
    const summary = summaryForRecord(records[0]!);
    expect(summary.sessionName).toBe('fix auth');
    expect(summary.messageCount).toBe(12);
    expect(summary.lifecycle).toBe('live');
  });

  test('an active heartbeat promotes an otherwise idle session to running', () => {
    const records = reconcileCatalogSessions(
      [live({ id: 'a' })],
      [],
      [{ job: { id: 'job-1', activeSessionId: 'a', status: 'active', nextRunAt: '2026-08-11T10:00:30.000Z' } }],
    );
    expect(records[0]!.section).toBe('running');
    expect(records[0]!.heartbeat?.activeCount).toBe(1);
  });

  test('an idle job leaves the section alone', () => {
    const records = reconcileCatalogSessions(
      [live({ id: 'a' })],
      [],
      [{ job: { id: 'job-1', activeSessionId: 'a', status: 'idle' } }],
    );
    expect(records[0]!.section).toBe('idle');
  });
});

describe('hierarchy', () => {
  const records = () =>
    reconcileCatalogSessions([
      live({ id: 'parent', sessionId: 'parent' }),
      live({
        id: 'child',
        sessionId: 'child',
        runtimeKind: 'subagent',
        parentSessionId: 'parent',
        activity: 'working',
      }),
      live({ id: 'grandchild', sessionId: 'grandchild', runtimeKind: 'subagent', parentSessionId: 'child' }),
    ]);

  test('collapsed parents render one subagent summary row', () => {
    const rows = buildCatalogRows(records());
    expect(rows.map(row => row.kind)).toEqual(['agent', 'subagent-summary']);
    expect(rows[1]!.title).toBe('1 subagent running');
  });

  test('expanding a parent nests its subagents', () => {
    const all = records();
    const rows = buildCatalogRows(all, new Set([all[0]!.identity]));
    expect(rows.map(row => row.kind)).toEqual(['agent', 'subagent', 'subagent-summary']);
    expect(rows[1]!.depth).toBe(1);
  });

  test('ancestors and children are discoverable by scope key', () => {
    const all = records();
    expect(hasCatalogChildren(all, { sessionId: 'parent' })).toBe(true);
    expect(hasCatalogChildren(all, { sessionId: 'grandchild' })).toBe(false);
    expect(getCatalogAncestorSessionIds(all, { sessionId: 'grandchild' })).toEqual(['parent', 'child']);
  });

  test('a running subagent keeps its ancestors in the running section', () => {
    const all = reconcileCatalogSessions([
      live({ id: 'parent', sessionId: 'parent' }),
      live({
        id: 'child',
        sessionId: 'child',
        runtimeKind: 'subagent',
        parentSessionId: 'parent',
        hasActiveHeartbeat: true,
      }),
    ]);
    const rows = buildCatalogRows(all, new Set([all[0]!.identity]));
    expect(rows[0]!.section).toBe('running');
    expect(rows[0]!.statusLabel).toBe('heartbeat active');
  });

  test('an orphaned subagent stays reachable as a root', () => {
    const all = reconcileCatalogSessions([
      live({ id: 'child', sessionId: 'child', runtimeKind: 'subagent', parentSessionId: 'missing' }),
    ]);
    const rows = buildCatalogRows(all);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.kind).toBe('agent');
  });
});

describe('scope', () => {
  const all = () =>
    reconcileCatalogSessions([
      live({ id: 'parent', sessionId: 'parent' }),
      live({ id: 'child', sessionId: 'child', runtimeKind: 'subagent', parentSessionId: 'parent' }),
      live({ id: 'other', sessionId: 'other' }),
    ]);

  test('push and back walk the frame stack', () => {
    const pushed = transitionCatalogScope([], { type: 'push', scope: { sessionId: 'parent' } });
    expect(pushed).toHaveLength(1);
    expect(transitionCatalogScope(pushed, { type: 'back' })).toHaveLength(0);
  });

  test('scoping keeps the root and its descendants only', () => {
    const scoped = scopeToSessionSubtree(all(), { sessionId: 'parent' });
    expect(scoped.map(record => summaryForRecord(record).sessionId)).toEqual(['parent', 'child']);
  });

  test('direct children of the scope root become top-level rows', () => {
    const scoped = scopeToSessionSubtree(all(), { sessionId: 'parent' });
    const rows = buildCatalogRows(scoped, new Set(), new Set(), { sessionId: 'parent' });
    expect(rows.map(row => row.summary.sessionId)).toEqual(['child']);
    expect(rows[0]!.kind).toBe('agent');
  });

  test('a vanished scope frame is dropped, keeping the deepest survivor', () => {
    const resolution = resolveCatalogScopeFrames(all(), [
      { scope: { sessionId: 'parent' } },
      { scope: { sessionId: 'gone' } },
    ]);
    expect(resolution.droppedFrames).toBe(1);
    expect(resolution.frames).toHaveLength(1);
    expect(summaryForRecord(resolution.root!).sessionId).toBe('parent');
  });

  test('depth counts the scope root, not the rows below it', () => {
    expect(getCatalogDepth(undefined)).toBe(0);
    expect(getCatalogDepth(summaryForRecord(all()[0]!))).toBe(1);
  });
});

describe('filtering', () => {
  test('a matching subagent pulls its ancestors in for context', () => {
    const all = reconcileCatalogSessions([
      live({ id: 'parent', sessionId: 'parent', sessionName: 'unrelated' }),
      live({
        id: 'child',
        sessionId: 'child',
        runtimeKind: 'subagent',
        parentSessionId: 'parent',
        sessionName: 'fix auth',
      }),
    ]);
    const filtered = filterCatalogSessions(all, text => text.includes('fix auth'));
    expect(filtered.map(record => summaryForRecord(record).sessionId)).toEqual(['parent', 'child']);
  });

  test('non-matching sessions are dropped', () => {
    const all = reconcileCatalogSessions([live({ id: 'a', sessionName: 'alpha' })]);
    expect(filterCatalogSessions(all, text => text.includes('beta'))).toHaveLength(0);
  });
});

describe('selection', () => {
  const rows = () =>
    buildCatalogRows(reconcileCatalogSessions([live({ id: 'a', sessionId: 'a' }), live({ id: 'b', sessionId: 'b' })]));

  test('a session is re-found by key after its identity changes', () => {
    const resolution = resolveCatalogSelectionState(rows(), 0, 'stale-identity', {
      sessionId: 'b',
      activeSessionId: 'b',
    });
    expect(resolution.resolved).toBe(true);
    expect(rows()[resolution.index]!.summary.sessionId).toBe('b');
  });

  test('a lost selection falls back to a bounded index', () => {
    const resolution = resolveCatalogSelectionState(rows(), 5, 'gone', { sessionId: 'gone' });
    expect(resolution.resolved).toBe(false);
    expect(resolution.index).toBe(1);
  });

  test('stepping skips read-only spawn-code rows', () => {
    const all = reconcileCatalogSessions([
      live({ id: 'parent', sessionId: 'parent' }),
      live({
        id: 'child',
        sessionId: 'child',
        runtimeKind: 'subagent',
        parentSessionId: 'parent',
        spawnCode: 'line one\nline two',
      }),
    ]);
    const expandedRows = buildCatalogRows(all, new Set([all[0]!.identity]), new Set([all[0]!.identity]));
    const codeRows = expandedRows.filter(row => row.kind === 'subagent-code');
    expect(codeRows.length).toBe(2);
    expect(codeRows.every(row => !row.selectable)).toBe(true);
    // From the parent (index 0) the next selectable row is the subagent itself.
    expect(expandedRows[stepCatalogSelection(expandedRows, 0, 1)]!.kind).toBe('subagent');
  });

  test('a long spawn program is capped with a remainder line', () => {
    const code = Array.from({ length: 14 }, (_, i) => `line ${i}`).join('\n');
    const all = reconcileCatalogSessions([
      live({ id: 'parent', sessionId: 'parent' }),
      live({ id: 'child', sessionId: 'child', runtimeKind: 'subagent', parentSessionId: 'parent', spawnCode: code }),
    ]);
    const rowsWithCode = buildCatalogRows(all, new Set([all[0]!.identity]), new Set([all[0]!.identity])).filter(
      row => row.kind === 'subagent-code',
    );
    expect(rowsWithCode).toHaveLength(11);
    expect(rowsWithCode.at(-1)!.code).toBe('… +4 more lines');
  });
});

describe('display', () => {
  test('every section gets a heading, empty ones say so', () => {
    const rows = buildCatalogRows(reconcileCatalogSessions([live({ id: 'a' })]));
    const items = buildDisplayItems(rows);
    expect(items.filter(item => item.type === 'heading')).toHaveLength(3);
    expect(items.filter(item => item.type === 'empty')).toHaveLength(2);
  });

  test('counts only top-level agents', () => {
    const all = reconcileCatalogSessions([
      live({ id: 'parent', sessionId: 'parent', activity: 'working' }),
      live({ id: 'child', sessionId: 'child', runtimeKind: 'subagent', parentSessionId: 'parent' }),
    ]);
    expect(countRowsBySection(buildCatalogRows(all))).toEqual({ running: 1, idle: 0, inactive: 0 });
  });
});

describe('formatting', () => {
  test('relative time steps through seconds, minutes, hours, days', () => {
    const now = Date.parse('2026-08-11T12:00:00.000Z');
    expect(formatCatalogRelativeTime('2026-08-11T11:59:30.000Z', now)).toBe('30s');
    expect(formatCatalogRelativeTime('2026-08-11T11:43:00.000Z', now)).toBe('17m');
    expect(formatCatalogRelativeTime('2026-08-11T09:00:00.000Z', now)).toBe('3h');
    expect(formatCatalogRelativeTime('2026-08-09T12:00:00.000Z', now)).toBe('2d');
    expect(formatCatalogRelativeTime(undefined, now)).toBe('');
  });

  test('the heartbeat badge shows the count and the next run', () => {
    const now = Date.parse('2026-08-11T12:00:00.000Z');
    expect(formatHeartbeatBadge({ activeCount: 2, nextRunAt: '2026-08-11T12:05:00.000Z' }, now)).toBe('♥ 2·5m');
    expect(formatHeartbeatBadge({ activeCount: 1 }, now)).toBe('♥ 1');
    expect(formatHeartbeatBadge(undefined, now)).toBe('');
  });
});
