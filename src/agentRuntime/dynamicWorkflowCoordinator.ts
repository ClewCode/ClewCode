/**
 * Dynamic Workflow ↔ Coordinator Mode bridge.
 *
 * When the coordinator is on and ultracode is enabled, the coordinator
 * can hand a long prompt to the dynamic-workflow runner. The runner
 * spawns N parallel subagents (one per subtask) using the same
 * `AgentTool` machinery that the coordinator already uses, then runs
 * each subtask's verifier (if any) before accepting the result.
 *
 * This module is the seam between the two systems: it doesn't reach
 * into QueryEngine / provider internals — it takes an `agentRunner`
 * callback that maps a `(subtask, context)` pair to an agent output,
 * the same way the static `Orchestrator` does.
 */

import {
  computeExecutionWaves,
  type DynamicSubtask,
  type DynamicWorkflow,
  type PlannerLlm,
} from './dynamicWorkflow.js';
import {
  createDynamicRun,
  type DynamicRunState,
  loadDynamicRun,
  type PersistedSubtaskResult,
} from './dynamicWorkflowPersistence.js';
import { runDynamicWorkflow, type SubtaskResult } from './dynamicWorkflowRunner.js';
import { verifyFinding } from './verifierAgent.js';

export type CoordinatorAgentRunner = (subtask: DynamicSubtask, context: string) => Promise<{ output: string }>;

/**
 * Run a dynamic workflow under the coordinator. Persists progress to
 * `.claude/runs/<id>/` so an interrupted run resumes from the last
 * completed wave. On resume, the host just calls this again with the
 * same workflow id and the persistence layer picks up where it left off.
 */
export async function runDynamicWorkflowAsCoordinator(params: {
  workspaceRoot: string;
  workflow: DynamicWorkflow;
  /** The LLM caller used for both planning and verification. */
  llm: PlannerLlm;
  /** How to actually execute one subtask via the coordinator's agents. */
  agentRunner: CoordinatorAgentRunner;
  /** Optional callback to stream progress to the terminal UI. */
  onProgress?: (params: { wave: number; total: number; completed: number }) => void;
  /** Force a fresh run even if persisted state exists. */
  fresh?: boolean;
}): Promise<{
  runState: DynamicRunState;
  results: SubtaskResult[];
  resumed: boolean;
}> {
  let runState: DynamicRunState;
  let resumed = false;

  if (!params.fresh) {
    const existing = await loadDynamicRun(params.workspaceRoot, params.workflow.id);
    if (existing && (existing.state.status === 'paused' || existing.state.status === 'running')) {
      runState = existing.state;
      resumed = true;
    } else {
      runState = await createDynamicRun(params.workspaceRoot, params.workflow);
    }
  } else {
    runState = await createDynamicRun(params.workspaceRoot, params.workflow);
  }

  runState = { ...runState, status: 'running' };

  const out = await runDynamicWorkflow({
    workflow: params.workflow,
    runSubtask: params.agentRunner,
    llm: params.llm,
    initialState: runState,
    persist: async ({ runState: s, result, waveIndex }) => {
      const next: DynamicRunState = {
        ...s,
        completedSubtaskIds: [...s.completedSubtaskIds, result.subtaskId],
        results: [...s.results, result],
        lastCompletedWave: waveIndex,
      };
      // Persist via the same call so the file is fresh on every subtask
      return next;
    },
    onWaveProgress: async ({ waveIndex, totalWaves, completed }) => {
      if (params.onProgress) {
        params.onProgress({ wave: waveIndex + 1, total: totalWaves, completed: completed.length });
      }
    },
    onSubtaskStatus: status => {
      params.onProgress?.({
        wave: status.waveIndex + 1,
        total: 0,
        completed: 0,
      });
    },
  });

  runState = { ...runState, status: 'completed' };

  return { runState, results: out.results, resumed };
}

/**
 * Standalone helper: build a verifier-only runner. Useful when the
 * host wants to re-verify an existing set of results without re-running
 * the subtasks themselves.
 */
export async function reverifyResults(params: {
  workflow: DynamicWorkflow;
  results: SubtaskResult[];
  llm: PlannerLlm;
}): Promise<SubtaskResult[]> {
  const subtaskById = new Map(params.workflow.subtasks.map(s => [s.id, s] as const));
  const resultById = new Map(params.results.map(r => [r.subtaskId, r] as const));
  const out: SubtaskResult[] = [];
  for (const result of params.results) {
    const subtask = subtaskById.get(result.subtaskId);
    if (!subtask?.verifiedBy) {
      out.push(result);
      continue;
    }
    const verifier = subtaskById.get(subtask.verifiedBy);
    if (!verifier) {
      out.push(result);
      continue;
    }
    const context = computeExecutionWaves(params.workflow)
      .flat()
      .filter(s => subtask.dependsOn.includes(s.id))
      .map(s => `### ${s.id}\n${resultById.get(s.id)?.output ?? ''}`)
      .join('\n');
    const verdict = await verifyFinding({ finding: result.output, context, llm: params.llm });
    out.push({
      ...result,
      verification: verdict.status,
      verificationReason: verdict.reason,
    });
  }
  return out;
}

export type { PersistedSubtaskResult };
