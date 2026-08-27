import { beforeEach, describe, expect, it } from 'bun:test';
import { isArtifactHandle } from '../handles.js';
import { RetainedArtifactStore } from '../store.js';

describe('RetainedArtifactStore', () => {
  let store: RetainedArtifactStore;

  beforeEach(() => {
    store = new RetainedArtifactStore();
  });

  it('stores large raw content and returns a compact handle', () => {
    const rawContent = 'Line 1\nLine 2\n'.repeat(500); // 7,000 chars
    const meta = store.put({
      type: 'test_output',
      label: 'bun test run #42',
      ownerAgentId: 'agent_runner',
      content: rawContent,
    });

    expect(isArtifactHandle(meta.handle)).toBe(true);
    expect(meta.tokenEstimate).toBeGreaterThan(1000);
    expect(meta.label).toBe('bun test run #42');

    // Retrieve via handle
    const retrieved = store.get(meta.handle);
    expect(retrieved).toBeDefined();
    expect(retrieved!.content).toBe(rawContent);

    // Restore directly
    const restored = store.restore(meta.handle);
    expect(restored).toBe(rawContent);
  });

  it('prunes all artifacts belonging to a terminated subagent', () => {
    store.put({
      type: 'log',
      label: 'Agent 1 log',
      ownerAgentId: 'agent_1',
      content: 'log data 1',
    });

    store.put({
      type: 'log',
      label: 'Agent 2 log',
      ownerAgentId: 'agent_2',
      content: 'log data 2',
    });

    expect(store.list().length).toBe(2);

    const removed = store.pruneAgentArtifacts('agent_1');
    expect(removed).toBe(1);
    expect(store.list('agent_1').length).toBe(0);
    expect(store.list('agent_2').length).toBe(1);
  });

  it('garbage collects expired artifacts according to TTL', async () => {
    store.put({
      type: 'json',
      label: 'Ephemeral search cache',
      ownerAgentId: 'agent_search',
      content: '{"results": []}',
      ttlMs: 10, // Expires in 10ms
    });

    store.put({
      type: 'diff',
      label: 'Persistent diff',
      ownerAgentId: 'agent_git',
      content: 'diff --git a/foo.ts',
      ttlMs: 100_000,
    });

    expect(store.list().length).toBe(2);

    // Wait 20ms for TTL to elapse
    await new Promise(resolve => setTimeout(resolve, 20));

    const gcRemoved = store.gc();
    expect(gcRemoved).toBe(1);
    expect(store.list().length).toBe(1);
    expect(store.list()[0]!.label).toBe('Persistent diff');
  });
});
