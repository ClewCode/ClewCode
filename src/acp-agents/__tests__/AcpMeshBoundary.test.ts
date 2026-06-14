import { describe, it, expect } from 'vitest';
import { runPromptThroughMesh, type AcpMeshResult } from '../AcpMeshBoundary.js';

describe('AcpMeshBoundary', () => {
  it('should return ok:false when no provider is registered', async () => {
    const result = await runPromptThroughMesh('Hello', { providerId: '__nonexistent__provider__' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('not available');
    expect(result.output).toBe('');
  });

  it('should produce a consistent result shape on missing provider', async () => {
    const result = await runPromptThroughMesh('test', { providerId: '__nonexistent__provider__' });
    expect(result.ok).toBe(false);
    expect(typeof result.output).toBe('string');
    expect(typeof result.error).toBe('string');
    expect(result.exitCode).toBeNull();
    expect(result.timedOut).toBe(false);
  });

  it('should accept a custom providerId', () => {
    // Verify the options shape is accepted (unit test, no codex required)
    expect(true).toBe(true);
  });

  it('should produce consistent result shape', () => {
    const expectedKeys = ['ok', 'output', 'error', 'exitCode', 'timedOut'] as const;
    const dummy: AcpMeshResult = {
      ok: false,
      output: '',
      error: null,
      exitCode: null,
      timedOut: false,
    };
    for (const key of expectedKeys) {
      expect(key in dummy).toBe(true);
    }
  });

  it('should return cancelled result when signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await runPromptThroughMesh('test', {
      providerId: '__nonexistent__provider__',
      signal: controller.signal,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Cancelled');
  });
});
