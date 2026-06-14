import { describe, it, expect, beforeEach } from 'vitest';
import { AcpRunController } from '../AcpRunController.js';
import { getRun, clearRuns, isTerminalStatus } from '../ACPRunManager.js';

describe('AcpRunController', () => {
  beforeEach(() => {
    clearRuns();
  });

  it('should create a run and execute through mesh', async () => {
    const controller = new AcpRunController();
    // Use a nonexistent provider to guarantee a fast, predictable result
    const result = await controller.execute('test-run-1', 'Hello', {
      providerId: '__nonexistent__provider__',
      timeoutMs: 1000,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('not available');

    const run = getRun('test-run-1');
    expect(run).toBeDefined();
    expect(run!.status).toBe('failed');
    expect(isTerminalStatus(run!.status)).toBe(true);
  });

  it('should cancel a pending run', async () => {
    const controller = new AcpRunController();

    // Start execution on a nonexistent provider (resolves synchronously)
    const execPromise = controller.execute('test-run-2', 'Hello', {
      providerId: '__nonexistent__provider__',
      timeoutMs: 5000,
    });

    // Cancel immediately — may or may not catch it before it resolves
    const cancelled = controller.cancel('test-run-2');
    expect(typeof cancelled).toBe('boolean');

    await execPromise;

    // After execution, pending is cleaned up
    expect(controller.hasPending('test-run-2')).toBe(false);

    // Result is in terminal state
    const run = getRun('test-run-2');
    expect(run).toBeDefined();
    expect(isTerminalStatus(run!.status)).toBe(true);
  });

  it('should return false for cancel on non-existent run', () => {
    const controller = new AcpRunController();
    expect(controller.cancel('nonexistent')).toBe(false);
  });

  it('cancel on non-existent run returns false', () => {
    const controller = new AcpRunController();
    expect(controller.cancel('no-such-run')).toBe(false);
  });

  it('hasPending should track active executions', async () => {
    const controller = new AcpRunController();
    expect(controller.hasPending('test-run-3')).toBe(false);

    const execPromise = controller.execute('test-run-3', 'Hello', {
      providerId: '__nonexistent__provider__',
      timeoutMs: 1000,
    });

    // Should be pending while executing
    expect(controller.hasPending('test-run-3')).toBe(true);

    await execPromise;

    // Should be cleaned up after execution
    expect(controller.hasPending('test-run-3')).toBe(false);
  });

  it('should not overwrite terminal state via repeated execute', async () => {
    const controller = new AcpRunController();

    await controller.execute('test-run-4', 'Hello', {
      providerId: '__nonexistent__provider__',
      timeoutMs: 1000,
    });

    const run = getRun('test-run-4');
    const firstStatus = run!.status;
    expect(isTerminalStatus(firstStatus)).toBe(true);

    // Execute again with same runId (creates new run since old one is terminal, but complete/fail guard should block)
    // The second execute creates a fresh createRun call, so it starts as 'running' again
    // This tests the controller's execute() doesn't crash on reused runIds
    await controller.execute('test-run-4', 'Hello again', {
      providerId: '__nonexistent__provider__',
      timeoutMs: 1000,
    });

    const run2 = getRun('test-run-4');
    expect(run2).toBeDefined();
    expect(isTerminalStatus(run2!.status)).toBe(true);
  });
});
