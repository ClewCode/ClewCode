/**
 * Persistence for Dynamic Workflow runs.
 *
 * Stores workflow plans + per-subtask results under `.claude/runs/<id>/`
 * so an interrupted run can be resumed from the last completed wave
 * instead of starting over.
 *
 * On disk layout:
 *   .claude/runs/<runId>/
 *     workflow.json   — full DynamicWorkflow plan
 *     state.json      — status, startedAt, completedSubtaskIds, results
 *     events.log      — newline-delimited JSON runtime events
 *
 * The state.json is what the runner reads on resume to know which
 * subtasks are already done.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { DynamicSubtask, DynamicWorkflow } from './dynamicWorkflow.js';

const RUNTIME_DIR = '.claude/runs';

export type DynamicRunStatus = 'planning' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

export type PersistedSubtaskResult = {
  subtaskId: string;
  output: string;
  durationMs: number;
  verification?: 'confirmed' | 'refuted' | 'inconclusive';
  verificationReason?: string;
  /** When this result was written; lets the host sort by completion order. */
  completedAt: string;
};

export type DynamicRunState = {
  runId: string;
  workflowId: string;
  status: DynamicRunStatus;
  startedAt: string;
  updatedAt: string;
  /** Ids of subtasks whose results are persisted in `results`. */
  completedSubtaskIds: string[];
  /** Ids of subtasks currently being executed (for live UI). */
  runningSubtaskIds?: string[];
  results: PersistedSubtaskResult[];
  /** Last wave that finished; the runner resumes from `waveIndex + 1`. */
  lastCompletedWave: number;
  /** Free-form error info when status === 'failed'. */
  failure?: { message: string; subtaskId?: string };
};

function runDir(workspaceRoot: string, runId: string): string {
  return path.join(workspaceRoot, RUNTIME_DIR, runId);
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Write the currently-running subtask IDs to disk so the live progress
 * UI can poll and show which agents are active. Called mid-wave by the
 * runner before subtasks start executing.
 */
export async function recordRunningSubtasks(
  workspaceRoot: string,
  state: DynamicRunState,
): Promise<void> {
  const dir = runDir(workspaceRoot, state.runId);
  await ensureDir(dir);
  const next = { ...state, updatedAt: nowIso() };
  await fs.writeFile(path.join(dir, 'state.json'), JSON.stringify(next, null, 2), 'utf-8');
}

export async function createDynamicRun(workspaceRoot: string, workflow: DynamicWorkflow): Promise<DynamicRunState> {
  const dir = runDir(workspaceRoot, workflow.id);
  await ensureDir(dir);
  const now = nowIso();
  const state: DynamicRunState = {
    runId: workflow.id,
    workflowId: workflow.id,
    status: 'planning',
    startedAt: now,
    updatedAt: now,
    completedSubtaskIds: [],
    results: [],
    lastCompletedWave: -1,
  };
  await Promise.all([
    fs.writeFile(path.join(dir, 'workflow.json'), JSON.stringify(workflow, null, 2), 'utf-8'),
    fs.writeFile(path.join(dir, 'state.json'), JSON.stringify(state, null, 2), 'utf-8'),
  ]);
  return state;
}

export async function loadDynamicRun(
  workspaceRoot: string,
  runId: string,
): Promise<{
  workflow: DynamicWorkflow;
  state: DynamicRunState;
} | null> {
  const dir = runDir(workspaceRoot, runId);
  try {
    const [workflowRaw, stateRaw] = await Promise.all([
      fs.readFile(path.join(dir, 'workflow.json'), 'utf-8'),
      fs.readFile(path.join(dir, 'state.json'), 'utf-8'),
    ]);
    return {
      workflow: JSON.parse(workflowRaw) as DynamicWorkflow,
      state: JSON.parse(stateRaw) as DynamicRunState,
    };
  } catch {
    return null;
  }
}

export async function updateDynamicRun(workspaceRoot: string, state: DynamicRunState): Promise<DynamicRunState> {
  const dir = runDir(workspaceRoot, state.runId);
  await ensureDir(dir);
  const next: DynamicRunState = { ...state, updatedAt: nowIso() };
  await fs.writeFile(path.join(dir, 'state.json'), JSON.stringify(next, null, 2), 'utf-8');
  return next;
}

export async function appendDynamicEvent(
  workspaceRoot: string,
  runId: string,
  event: { type: string; data?: unknown },
): Promise<void> {
  const dir = runDir(workspaceRoot, runId);
  await ensureDir(dir);
  const line = `${JSON.stringify({ ...event, at: nowIso() })}\n`;
  await fs.appendFile(path.join(dir, 'events.log'), line, 'utf-8');
}

export async function listDynamicRuns(workspaceRoot: string): Promise<DynamicRunState[]> {
  const all = await listAllDynamicRuns(workspaceRoot);
  return all.filter(s => s.status === 'paused' || s.status === 'running');
}

export async function listAllDynamicRuns(workspaceRoot: string): Promise<DynamicRunState[]> {
  const root = path.join(workspaceRoot, RUNTIME_DIR);
  let entries: string[];
  try {
    entries = await fs.readdir(root);
  } catch {
    return [];
  }
  const out: DynamicRunState[] = [];
  for (const name of entries) {
    const loaded = await loadDynamicRun(workspaceRoot, name);
    if (loaded) out.push(loaded.state);
  }
  out.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  return out;
}

/**
 * Mark a persisted run as cancelled. No-op if the run is already in a
 * terminal state (completed/failed/cancelled) or does not exist.
 */
export async function cancelDynamicRun(workspaceRoot: string, runId: string): Promise<DynamicRunState | null> {
  const loaded = await loadDynamicRun(workspaceRoot, runId);
  if (!loaded) return null;
  if (loaded.state.status === 'completed' || loaded.state.status === 'failed' || loaded.state.status === 'cancelled') {
    return loaded.state;
  }
  const next: DynamicRunState = { ...loaded.state, status: 'cancelled' };
  return updateDynamicRun(workspaceRoot, next);
}

/**
 * Return the subtasks of a workflow that have NOT yet been recorded in
 * state. The runner uses this to skip work that already completed
 * before an interrupt.
 */
export function pendingSubtasks(workflow: DynamicWorkflow, state: DynamicRunState): DynamicSubtask[] {
  const done = new Set(state.completedSubtaskIds);
  return workflow.subtasks.filter(s => !done.has(s.id));
}

/**
 * Persist a single subtask's result. Returns the updated state.
 */
export async function recordSubtaskCompletion(
  workspaceRoot: string,
  state: DynamicRunState,
  result: PersistedSubtaskResult,
): Promise<DynamicRunState> {
  const next: DynamicRunState = {
    ...state,
    completedSubtaskIds: [...state.completedSubtaskIds, result.subtaskId],
    results: [...state.results, result],
  };
  return updateDynamicRun(workspaceRoot, next);
}
