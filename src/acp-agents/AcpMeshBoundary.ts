/**
 * ACP-to-Mesh Execution Boundary.
 *
 * Shared path that both Editor ACP (services/acp) and REST ACP (acp-agents)
 * use to route prompt execution through the process peer / mesh layer.
 *
 * This avoids duplicating provider resolution and result mapping in
 * each ACP path, and ensures consistent error handling.
 */

import { getProcessMeshProvider } from '../mesh/ProcessMeshProvider.js';
import type { ProcessPeerResult } from '../mesh/ProcessMeshProvider.js';

export interface AcpMeshResult {
  ok: boolean;
  output: string;
  error: string | null;
  exitCode: number | null;
  timedOut: boolean;
}

export interface AcpMeshOptions {
  /** Mesh provider ID (default: 'codex') */
  providerId?: string;
  /** Task timeout in ms (default: 120_000) */
  timeoutMs?: number;
  /** AbortSignal to cancel in-flight execution */
  signal?: AbortSignal;
  /** Progress callback for streaming output chunks */
  onProgress?: (chunk: string) => void;
}

/**
 * Execute a prompt through the mesh process peer layer.
 *
 * Resolves the named provider, calls runTask, and maps the result
 * to a simple { ok, output, error } shape suitable for both ACP protocols.
 */
export async function runPromptThroughMesh(prompt: string, opts: AcpMeshOptions = {}): Promise<AcpMeshResult> {
  const providerId = opts.providerId ?? 'codex';
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const signal = opts.signal;

  // Check if already cancelled before starting
  if (signal?.aborted) {
    return {
      ok: false,
      output: '',
      error: 'Cancelled',
      exitCode: null,
      timedOut: false,
    };
  }

  const provider = getProcessMeshProvider(providerId);
  if (!provider) {
    return {
      ok: false,
      output: '',
      error: `Mesh provider not available: ${providerId}. Install the ${providerId} CLI to execute tasks.`,
      exitCode: null,
      timedOut: false,
    };
  }

  const onProgress = opts.onProgress;

  let result: ProcessPeerResult;
  try {
    result = await provider.runTask({
      prompt,
      timeoutMs,
      ...(onProgress ? { onProgress: ev => { if (ev.outputTail) onProgress(ev.outputTail); } } : {}),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      output: '',
      error: `Execution error: ${message}`,
      exitCode: null,
      timedOut: false,
    };
  }

  // Check if cancelled during execution
  if (signal?.aborted) {
    return {
      ok: false,
      output: result.stdout || '',
      error: 'Cancelled',
      exitCode: result.exitCode,
      timedOut: false,
    };
  }

  if (result.timedOut) {
    return {
      ok: false,
      output: result.stdout || '',
      error: 'Task timed out',
      exitCode: result.exitCode,
      timedOut: true,
    };
  }

  if (result.exitCode !== 0) {
    return {
      ok: false,
      output: result.stdout || '',
      error: result.stderr || `Exit code ${result.exitCode}`,
      exitCode: result.exitCode,
      timedOut: false,
    };
  }

  return {
    ok: true,
    output: result.stdout?.trim() || '(completed with no output)',
    error: null,
    exitCode: 0,
    timedOut: false,
  };
}
