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

import { mapWithLimit } from '../utils/semaphore.js';
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
  /** Subtask ids whose checkpoint write failed; they will re-run on resume. */
  unpersisted?: string[];
}> {
  const waves = computeExecutionWaves(params.workflow);
  const allResults: SubtaskResult[] = [];
  const resultById = new Map<string, SubtaskResult>();
  const contextCharLimit = params.contextCharLimit ?? 8000;
  /** Subtasks that ran but whose checkpoint write failed — reported, never silent. */
  const unpersisted: string[] = [];

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
    // `maxParallel` bounds how many run *at once*, not how many run at all.
    // Slicing the wave here silently dropped every subtask past the cap: waves
    // are computed once and never revisited, and `lastCompletedWave` advances
    // regardless, so a resume skipped them too.
    const runningIds = todo.map(s => s.id);
    if (runState && (params as any).workspaceRoot) {
      const pendingRunState = {
        ...runState,
        runningSubtaskIds: runningIds,
      };
      try {
        const { recordRunningSubtasks } = await import('./dynamicWorkflowPersistence.js');
        await recordRunningSubtasks((params as any).workspaceRoot, pendingRunState);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`[dynamicWorkflowRunner] failed to record running subtasks: ${msg}`);
      }
    }

    const settled = await mapWithLimit(todo, params.workflow.maxParallel, async subtask => {
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
    });

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
          // Best-effort per result: a failed write loses that one checkpoint,
          // not the wave. Throwing here would discard finished subtask output
          // that is already in `allResults` and cannot be recomputed cheaply.
          try {
            runState = await params.persist({ runState, result: persisted, waveIndex: i });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            unpersisted.push(result.subtaskId);
            console.warn(`[dynamicWorkflowRunner] failed to persist subtask ${result.subtaskId}: ${msg}`);
          }
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
  if (unpersisted.length > 0) {
    console.warn(
      `[dynamicWorkflowRunner] ${unpersisted.length} subtask result(s) ran but were not checkpointed and will re-run on resume: ${unpersisted.join(', ')}`,
    );
  }
  return {
    results: allResults,
    waves: waves.length,
    accepted,
    refuted,
    finalState: runState,
    unpersisted: unpersisted.length > 0 ? [...unpersisted] : undefined,
  };
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
