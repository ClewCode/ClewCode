/**
 * ACP Run Controller — Lifecycle owner for ACP prompt/run execution.
 *
 * Owns the full lifecycle of a run: creation, AbortController, mesh execution,
 * and terminal state mapping via ACPRunManager.
 *
 * Both editor ACP (services/acp) and REST ACP (acp-agents) route through this
 * controller so that cancel, completion, and failure are handled consistently.
 */

import { createRun, completeRun, failRun, cancelRun } from './ACPRunManager.js';
import { runPromptThroughMesh } from './AcpMeshBoundary.js';
import { resultToACPMessage } from './ACPMessageConverter.js';
import type { AcpMeshResult, AcpMeshOptions } from './AcpMeshBoundary.js';

export class AcpRunController {
  private pending = new Map<string, AbortController>();

  /**
   * Execute a prompt as a managed run.
   *
   * Creates a run in ACPRunManager, wires an AbortController, executes through
   * the mesh boundary, and maps the result to the correct terminal state.
   *
   * @param runId - Unique run identifier
   * @param prompt - The prompt text to execute
   * @param opts - Mesh options (providerId, timeoutMs, etc.)
   * @returns The mesh result for caller-side handling (sessionUpdate, etc.)
   */
  async execute(runId: string, prompt: string, opts?: AcpMeshOptions): Promise<AcpMeshResult> {
    createRun(runId, 'clew-code', prompt);

    const controller = new AbortController();
    this.pending.set(runId, controller);

    const result = await runPromptThroughMesh(prompt, {
      ...opts,
      signal: controller.signal,
    });

    this.pending.delete(runId);

    // Map result to terminal state (guarded by ACPRunManager)
    if (result.ok) {
      completeRun(runId, [resultToACPMessage(result.output)]);
    } else if (result.error === 'Cancelled') {
      cancelRun(runId);
    } else {
      failRun(runId, result.error || 'Execution failed');
    }

    return result;
  }

  /**
   * Cancel a pending run by aborting its AbortController.
   *
   * The mesh boundary checks the signal and returns a cancelled result,
   * which the execute() method maps to cancelRun().
   *
   * @returns true if a pending run was found and aborted
   */
  cancel(runId: string): boolean {
    const controller = this.pending.get(runId);
    if (!controller) return false;
    controller.abort();
    return true;
  }

  /**
   * Check whether a run ID has a pending execution.
   */
  hasPending(runId: string): boolean {
    return this.pending.has(runId);
  }
}
