/**
 * Dynamic Workflow Runner
 *
 * Executes a `DynamicWorkflow` by walking its dependency graph wave-by-
 * wave, running each wave's subtasks in parallel up to
 * `workflow.maxParallel`. Every subtask's output is verified by its
 * `verifiedBy` sibling before being accepted.
 *
 * The runner is intentionally provider-agnostic: the host passes a
 * `subtaskRunner` callback that knows how to actually execute one
 * subtask (fork a subagent, run a CLI, etc.). This keeps the runner
 * testable and lets it ride on top of whatever execution model the
 * host already has (the static `Orchestrator`, an in-process teammate,
 * an external swarm, etc.).
 */

import type { DynamicSubtask, DynamicWorkflow, PlannerLlm } from './dynamicWorkflow.js';
import { computeExecutionWaves } from './dynamicWorkflow.js';
import {
  type DynamicRunState,
  type PersistedSubtaskResult,
  recordSubtaskCompletion,
} from './dynamicWorkflowPersistence.js';
import { verifyFinding } from './verifierAgent.js';

export type SubtaskResult = {
  subtaskId: string;
  output: string;
  /** Wall-clock duration in ms, mostly for the report. */
  durationMs: number;
  /** Whether the result was confirmed, refuted, or inconclusive. */
  verification?: 'confirmed' | 'refuted' | 'inconclusive';
  /** Verifier's reason when verification was refuted. */
  verificationReason?: string;
};

export type SubtaskRunner = (subtask: DynamicSubtask, context: string) => Promise<{ output: string }>;

/**
 * Callback invoked after each wave finishes, so the host can stream
 * progress to the terminal UI or persist intermediate state for resume.
 */
export type WaveProgressCallback = (params: {
  waveIndex: number;
  totalWaves: number;
  completed: SubtaskResult[];
  remaining: number;
}) => void | Promise<void>;

/**
 * Optional persistence hook. When provided, the runner will checkpoint
 * after every subtask so an interrupted run can resume from the last
 * completed wave instead of starting over (matches the announcement's
 * "progress is saved as the run goes" guarantee).
 */
export type PersistenceHook = (params: {
  runState: DynamicRunState;
  result: PersistedSubtaskResult;
  waveIndex: number;
}) => Promise<DynamicRunState>;

/** Called when a subtask starts/finishes executing */
export type SubtaskStatusCallback = (params: {
  subtaskId: string;
  role: string;
  title: string;
  status: 'running' | 'completed' | 'failed';
  waveIndex: number;
}) => void;

/**
 * Resume a previously-paused run. Subtasks already in `runState` are
 * skipped; the runner continues from the next ready wave.
 */
export async function runDynamicWorkflow(params: {
  workflow: DynamicWorkflow;
  runSubtask: SubtaskRunner;
  llm: PlannerLlm;
  onWaveProgress?: WaveProgressCallback;
  /** Called when a subtask starts/finishes (for live status UI). */
  onSubtaskStatus?: SubtaskStatusCallback;
  /** Hard cap on total subtask output chars to feed into the verifier context. */
  contextCharLimit?: number;
  /** Optional initial state for resume. */
  initialState?: DynamicRunState;
  /** Optional persistence hook (e.g. backed by disk). */
  persist?: PersistenceHook;
}): Promise<{
  results: SubtaskResult[];
  waves: number;
  accepted: number;
  refuted: number;
  finalState?: DynamicRunState;
}> {
  const waves = computeExecutionWaves(params.workflow);
  const allResults: SubtaskResult[] = [];
  const resultById = new Map<string, SubtaskResult>();
  const contextCharLimit = params.contextCharLimit ?? 8000;

  // Hydrate from prior state when resuming
  let runState = params.initialState;
  if (runState) {
    for (const r of runState.results) {
      allResults.push({
        subtaskId: r.subtaskId,
        output: r.output,
        durationMs: r.durationMs,
        verification: r.verification,
        verificationReason: r.verificationReason,
      });
      resultById.set(r.subtaskId, allResults[allResults.length - 1]!);
    }
  }

  const startWave = runState ? Math.max(0, runState.lastCompletedWave + 1) : 0;
  for (let i = startWave; i < waves.length; i++) {
    const wave = waves[i]!;
    // Skip subtasks already completed (resume case)
    const todo = wave.filter(s => !resultById.has(s.id));
    if (todo.length === 0) continue;
    const bounded = todo.slice(0, params.workflow.maxParallel);

    // Save running state to disk so the progress UI can see live status
    const runningIds = bounded.map(s => s.id);
    if (runState && (params as any).workspaceRoot) {
      const pendingRunState = {
        ...runState,
        runningSubtaskIds: runningIds,
      };
      try {
        const { recordRunningSubtasks } = await import('./dynamicWorkflowPersistence.js');
        await recordRunningSubtasks((params as any).workspaceRoot, pendingRunState);
      } catch {
        /* non-critical */
      }
    }

    const settled = await Promise.all(
      bounded.map(async subtask => {
        params.onSubtaskStatus?.({
          subtaskId: subtask.id,
          role: subtask.role,
          title: subtask.title,
          status: 'running',
          waveIndex: i,
        });
        const start = Date.now();
        let output: string;
        try {
          const context = buildSubtaskContext(subtask, resultById, contextCharLimit);
          const result = await params.runSubtask(subtask, context);
          output = result.output;
          params.onSubtaskStatus?.({
            subtaskId: subtask.id,
            role: subtask.role,
            title: subtask.title,
            status: 'completed',
            waveIndex: i,
          });
        } catch (err) {
          output = `Error: ${err instanceof Error ? err.message : String(err)}`;
          params.onSubtaskStatus?.({
            subtaskId: subtask.id,
            role: subtask.role,
            title: subtask.title,
            status: 'failed',
            waveIndex: i,
          });
        }
        const base: SubtaskResult = {
          subtaskId: subtask.id,
          output,
          durationMs: Date.now() - start,
        };
        return base;
      }),
    );

    // Verify each subtask that has a `verifiedBy` pointer.
    const subtaskById = new Map(params.workflow.subtasks.map(s => [s.id, s] as const));
    for (const result of settled) {
      const subtask = subtaskById.get(result.subtaskId);
      if (subtask?.verifiedBy) {
        const verifier = subtaskById.get(subtask.verifiedBy);
        if (verifier) {
          const context = buildSubtaskContext(
            verifier,
            new Map([...resultById, [result.subtaskId, result]]),
            contextCharLimit,
          );
          const verdict = await verifyFinding({
            finding: result.output,
            context,
            llm: params.llm,
          });
          result.verification = verdict.status;
          result.verificationReason = verdict.reason;
        }
      }
      resultById.set(result.subtaskId, result);
      allResults.push(result);

      // Persist after each subtask so we never lose work to a crash.
      // BUG #19: persist requires runState (for runId/workflowId) — warn instead of
      // silently no-op'ing when persist is supplied without initialState, since that
      // combination means the caller's intent (durable progress) can never be honored.
      if (params.persist) {
        if (runState) {
          const persisted: PersistedSubtaskResult = {
            subtaskId: result.subtaskId,
            output: result.output,
            durationMs: result.durationMs,
            verification: result.verification,
            verificationReason: result.verificationReason,
            completedAt: new Date().toISOString(),
          };
          runState = await params.persist({ runState, result: persisted, waveIndex: i });
        } else {
          console.warn(
            '[dynamicWorkflowRunner] persist hook provided without initialState — progress will not be persisted',
          );
        }
      }
    }

    if (runState) {
      runState = { ...runState, lastCompletedWave: i };
    }

    if (params.onWaveProgress) {
      await params.onWaveProgress({
        waveIndex: i,
        totalWaves: waves.length,
        completed: [...allResults],
        remaining: params.workflow.subtasks.length - allResults.length,
      });
    }
  }

  const accepted = allResults.filter(r => r.verification === 'confirmed' || r.verification === undefined).length;
  const refuted = allResults.filter(r => r.verification === 'refuted').length;
  return { results: allResults, waves: waves.length, accepted, refuted, finalState: runState };
}

/**
 * Convenience: build a `PersistenceHook` that writes to disk under
 * `.clew/runs/<runId>/state.json` after every subtask. Use with
 * `loadDynamicRun` to resume.
 */
export function diskPersistenceHook(workspaceRoot: string): PersistenceHook {
  return async ({ runState, result }) => {
    return recordSubtaskCompletion(workspaceRoot, runState, result);
  };
}

function buildSubtaskContext(
  subtask: DynamicSubtask,
  resultById: Map<string, SubtaskResult>,
  charLimit: number,
): string {
  if (subtask.dependsOn.length === 0) return '';
  const parts: string[] = [];
  let used = 0;
  for (const depId of subtask.dependsOn) {
    const dep = resultById.get(depId);
    if (!dep) continue;
    const chunk = `### ${depId}\n${truncate(dep.output, 1500)}\n`;
    if (used + chunk.length > charLimit) break;
    parts.push(chunk);
    used += chunk.length;
  }
  return parts.join('\n');
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n... [truncated]`;
}
