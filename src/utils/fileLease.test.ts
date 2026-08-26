import { beforeEach, describe, expect, it } from 'bun:test';
import {
  acquireFileWriteLease,
  getActiveFileLease,
  globalFileLeaseManager,
  releaseAllAgentLeases,
  releaseFileWriteLease,
} from './fileLease.js';

describe('File Lease Concurrency Guard', () => {
  beforeEach(() => {
    globalFileLeaseManager.clear();
  });

  it('allows an agent to acquire a write lease on a free file', () => {
    const res = acquireFileWriteLease('src/index.ts', 'agent-1', 'Refactoring entrypoint');
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.lease.agentId).toBe('agent-1');
      expect(res.lease.description).toBe('Refactoring entrypoint');
    }

    const lease = getActiveFileLease('src/index.ts');
    expect(lease).toBeDefined();
    expect(lease?.agentId).toBe('agent-1');
  });

  it('allows the same agent to re-acquire or refresh its own lease', () => {
    acquireFileWriteLease('src/utils/math.ts', 'agent-1');
    const res = acquireFileWriteLease('src/utils/math.ts', 'agent-1', 'Second edit');
    expect(res.success).toBe(true);
  });

  it('rejects lease acquisition from a different agent on the same path and returns conflict info', () => {
    acquireFileWriteLease('src/services/api.ts', 'agent-1', 'Adding endpoints');

    const res = acquireFileWriteLease('src/services/api.ts', 'agent-2', 'Fixing types');
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.conflictWith.agentId).toBe('agent-1');
      expect(res.conflictWith.description).toBe('Adding endpoints');
    }
  });

  it('handles normalized paths identically across relative and absolute forms', () => {
    acquireFileWriteLease('src/foo/../foo/bar.ts', 'agent-1');

    const res = acquireFileWriteLease('src/foo/bar.ts', 'agent-2');
    expect(res.success).toBe(false);
  });

  it('releases a specific lease', () => {
    acquireFileWriteLease('src/temp.ts', 'agent-1');
    expect(releaseFileWriteLease('src/temp.ts', 'agent-1')).toBe(true);
    expect(getActiveFileLease('src/temp.ts')).toBeUndefined();

    // Now agent-2 can acquire
    const res = acquireFileWriteLease('src/temp.ts', 'agent-2');
    expect(res.success).toBe(true);
  });

  it('releases all leases when an agent finishes or is terminated', () => {
    acquireFileWriteLease('src/a.ts', 'agent-1');
    acquireFileWriteLease('src/b.ts', 'agent-1');
    acquireFileWriteLease('src/c.ts', 'agent-2');

    const released = releaseAllAgentLeases('agent-1');
    expect(released).toBe(2);

    expect(getActiveFileLease('src/a.ts')).toBeUndefined();
    expect(getActiveFileLease('src/b.ts')).toBeUndefined();
    expect(getActiveFileLease('src/c.ts')?.agentId).toBe('agent-2');
  });
});
