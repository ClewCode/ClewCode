import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runWithAgentContext } from '../../utils/agentContext.js';

// bun executes every test file in one process, so these module singletons must
// be exercised from a single file with a per-test storage root.
import {
  ensureMainAgentEntry,
  listAgentTree,
  registerAgentSpawned,
  setAgentState,
  setAgentTreeHomeOverrideForTests,
} from './agentSessionRegistry.js';
import {
  formatAgentTokenReport,
  loadAgentUsageTotals,
  recordAgentUsage,
  resetAgentLedgerForTests,
  setLedgerHomeOverrideForTests,
} from './agentTokenLedger.js';
import { drainInbox, enqueue, inboxDepth, setQueueHomeOverrideForTests } from './durableMessageQueue.js';
import {
  listRetainedArtifacts,
  recallArtifact,
  retainArtifact,
  setArtifactHomeOverrideForTests,
} from './retainedArtifacts.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'agenttree-'));
  setAgentTreeHomeOverrideForTests(root);
  setLedgerHomeOverrideForTests(root);
  setQueueHomeOverrideForTests(root);
  setArtifactHomeOverrideForTests({ sessionId: 'sess-1', base: root });
});

afterEach(() => {
  resetAgentLedgerForTests();
  setAgentTreeHomeOverrideForTests();
  setLedgerHomeOverrideForTests();
  setQueueHomeOverrideForTests();
  setArtifactHomeOverrideForTests();
});

describe('registry — durable session tree', () => {
  test('root + children persist and survive cache drop', () => {
    ensureMainAgentEntry();
    registerAgentSpawned({ id: 'a1', parentId: 'main', name: 'Explore', kind: 'subagent' });
    registerAgentSpawned({ id: 'a2', parentId: 'a1', name: 'worker', kind: 'teammate' });
    setAgentState('a1', 'needs-input');

    setAgentTreeHomeOverrideForTests(root); // simulate restart: drop memory cache
    const list = listAgentTree();
    expect(list[0]?.id).toBe('main');
    expect(list.find(e => e.id === 'a1')?.state).toBe('needs-input');
    expect(list.find(e => e.id === 'a2')?.parentId).toBe('a1');
  });

  test('setAgentState on unknown id is a no-op', () => {
    expect(() => setAgentState('ghost', 'idle')).not.toThrow();
  });
});

describe('ledger — rooted token accounting', () => {
  const usage = (over: Partial<Parameters<typeof recordAgentUsage>[0]> = {}) =>
    recordAgentUsage({
      model: 'm1',
      inputTokens: 10,
      outputTokens: 5,
      cacheReadInputTokens: 2,
      cacheCreationInputTokens: 0,
      costUSD: 0.01,
      ...over,
    });

  test('defaults to main attribution', () => {
    usage();
    const totals = loadAgentUsageTotals();
    expect(totals.get('main')?.calls).toBe(1);
    expect(totals.get('main')?.inputTokens).toBe(10);
  });

  test('records parent link + aggregates per agentId', () => {
    registerAgentSpawned({ id: 'child-1', parentId: 'main', name: 'Explore', kind: 'subagent' });
    runWithAgentContext({ agentId: 'child-1', agentType: 'subagent' as const }, () => {
      usage();
      usage();
    });
    const totals = loadAgentUsageTotals();
    expect(totals.get('child-1')?.calls).toBe(2);
    expect(totals.get('child-1')?.parentAgentId).toBe('main');
    expect(totals.get('child-1')?.outputTokens).toBe(10);
    expect(totals.get('main')).toBeUndefined(); // parent did not pay
  });

  test('formatAgentTokenReport renders subagents sorted by cost', () => {
    registerAgentSpawned({ id: 'cheap', name: 'Explore', kind: 'subagent' });
    registerAgentSpawned({ id: 'pricey', parentId: 'main', name: 'worker', kind: 'subagent' });
    runWithAgentContext({ agentId: 'cheap', agentType: 'subagent' as const }, () => usage({ costUSD: 0.01 }));
    runWithAgentContext({ agentId: 'pricey', agentType: 'subagent' as const }, () => usage({ costUSD: 0.9 }));
    const report = formatAgentTokenReport();
    expect(report.indexOf('pricey')).toBeLessThan(report.indexOf('cheap'));
    expect(report).toContain('$0.9000');
  });
});

describe('queue — durable messages', () => {
  test('enqueue → depth → drain acks exactly once', () => {
    enqueue('worker-1', 'main', 'first');
    enqueue('worker-1', 'main', 'second');
    expect(inboxDepth('worker-1')).toBe(2);
    expect(drainInbox('worker-1').map(m => m.text)).toEqual(['first', 'second']);
    expect(drainInbox('worker-1')).toEqual([]);
  });

  test('survives restart simulation', () => {
    enqueue('latch', 'peer', 'pre-shutdown');
    setQueueHomeOverrideForTests(root);
    expect(inboxDepth('latch')).toBe(1);
    expect(drainInbox('latch')[0]?.text).toBe('pre-shutdown');
  });

  test('drain on unknown agent is empty', () => {
    expect(drainInbox('nobody')).toEqual([]);
  });
});

describe('retainedArtifacts', () => {
  test('retain → stub → recall round-trip', () => {
    const { record, stub } = retainArtifact('big tool output', 'x'.repeat(200));
    expect(record.handle).toMatch(/^ev_/);
    expect(stub).toContain('recall with restoreArtifact');
    expect(recallArtifact(record.handle)?.content).toBe('x'.repeat(200));
    expect(listRetainedArtifacts().map(r => r.label)).toContain('big tool output');
  });
});
