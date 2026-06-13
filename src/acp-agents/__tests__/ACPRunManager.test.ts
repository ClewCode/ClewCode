import { describe, it, expect, beforeEach } from 'vitest';
import { createRun, getRun, listRuns, completeRun, failRun, cancelRun, clearRuns } from '../ACPRunManager.js';

describe('ACPRunManager', () => {
  beforeEach(() => {
    clearRuns();
  });

  it('should create and retrieve a run', () => {
    const run = createRun('run-1', 'echo', 'Hello');
    expect(run.id).toBe('run-1');
    expect(run.agentName).toBe('echo');
    expect(run.status).toBe('running');

    const retrieved = getRun('run-1');
    expect(retrieved).toBeDefined();
    expect(retrieved!.status).toBe('running');
  });

  it('should complete a run with output', () => {
    createRun('run-2', 'echo', 'test');
    const completed = completeRun('run-2', 'Hello back');
    expect(completed).toBeDefined();
    expect(completed!.status).toBe('completed');
    expect(completed!.output).toBe('Hello back');
    expect(completed!.completedAt).toBeTypeOf('number');
  });

  it('should fail a run with error', () => {
    createRun('run-3', 'echo', 'test');
    const failed = failRun('run-3', 'Something went wrong');
    expect(failed).toBeDefined();
    expect(failed!.status).toBe('failed');
    expect(failed!.error).toBe('Something went wrong');
  });

  it('should cancel a run', () => {
    createRun('run-4', 'echo', 'test');
    const cancelled = cancelRun('run-4');
    expect(cancelled).toBeDefined();
    expect(cancelled!.status).toBe('cancelled');
  });

  it('should list all runs', () => {
    createRun('a', 'agent-a', '');
    createRun('b', 'agent-b', '');
    const runs = listRuns();
    expect(runs.length).toBe(2);
  });

  it('should return undefined for non-existent run operations', () => {
    expect(getRun('nonexistent')).toBeUndefined();
    expect(completeRun('nonexistent', 'x')).toBeUndefined();
    expect(failRun('nonexistent', 'x')).toBeUndefined();
    expect(cancelRun('nonexistent')).toBeUndefined();
  });
});
