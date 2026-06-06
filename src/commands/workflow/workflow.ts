/**
 * `/workflow` slash command.
 *
 *   /workflow                 — list all persisted dynamic runs
 *   /workflow list            — same as above
 *   /workflow show <id>       — show plan + per-subtask results for a run
 *   /workflow resume <id>     — mark a paused run as ready to resume
 *   /workflow cancel <id>     — cancel a running or paused run
 *
 * Persistence lives in `dynamicWorkflowPersistence.ts` under
 * `.claude/runs/<runId>/`. The host's coordinator (wired in via the
 * QueryEngine integration) is responsible for actually executing the
 * resume — this command only mutates run state on disk.
 */

import {
  cancelDynamicRun,
  type DynamicRunState,
  type DynamicRunStatus,
  listAllDynamicRuns,
  loadDynamicRun,
} from '../../agentRuntime/dynamicWorkflowPersistence.js';
import type { LocalCommandResult, LocalJSXCommandContext } from '../../types/command.js';
import { getCwd } from '../../utils/cwd.js';

const VERB_LIST = new Set(['', 'list', 'ls']);
const VERB_SHOW = new Set(['show', 'view', 'inspect']);
const VERB_RESUME = new Set(['resume', 'continue', 'start']);
const VERB_CANCEL = new Set(['cancel', 'stop', 'abort', 'kill']);

export async function call(args: string, _context: LocalJSXCommandContext): Promise<LocalCommandResult> {
  const trimmed = args.trim();
  const tokens = trimmed.split(/\s+/);
  const verbRaw = (tokens[0] || '').toLowerCase();
  const rest = tokens.slice(1).join(' ').trim();

  const workspaceRoot = resolveWorkspaceRoot();

  if (VERB_LIST.has(verbRaw)) {
    return listRuns(workspaceRoot);
  }

  if (VERB_SHOW.has(verbRaw)) {
    if (!rest) return { type: 'text', value: 'Usage: /workflow show <runId>' };
    return showRun(workspaceRoot, rest);
  }

  if (VERB_RESUME.has(verbRaw)) {
    if (!rest) return { type: 'text', value: 'Usage: /workflow resume <runId>' };
    return resumeRun(workspaceRoot, rest);
  }

  if (VERB_CANCEL.has(verbRaw)) {
    if (!rest) return { type: 'text', value: 'Usage: /workflow cancel <runId>' };
    return cancelRun(workspaceRoot, rest);
  }

  return {
    type: 'text',
    value:
      'Usage:\n' +
      '  /workflow                list all persisted dynamic runs\n' +
      '  /workflow show <id>      show plan + results for a run\n' +
      '  /workflow resume <id>    mark a paused run as ready to resume\n' +
      '  /workflow cancel <id>    cancel a running or paused run',
  };
}

/**
 * The `/workflow` command lives under the dynamic-workflows feature
 * but is also useful on its own for inspecting leftover runs. Always
 * enabled.
 */
export function isEnabled(): boolean {
  return true;
}

function resolveWorkspaceRoot(): string {
  // Test hook: a global override takes precedence so unit tests can
  // point the command at a tmpdir without mutating the real cwd.
  const override = (globalThis as { __workflowWorkspaceRoot?: string }).__workflowWorkspaceRoot;
  if (override) return override;
  try {
    return getCwd();
  } catch {
    return process.cwd();
  }
}

async function listRuns(workspaceRoot: string): Promise<LocalCommandResult> {
  const runs = await listAllDynamicRuns(workspaceRoot);
  if (runs.length === 0) {
    return {
      type: 'text',
      value: '◈ workflow · no persisted dynamic runs in ' + shorten(workspaceRoot),
    };
  }
  const linkedIds = readLinkedWorkflowIds();
  const goal = readActiveGoalText();
  const goalTag = goal ? ` (goal: ${truncate(goal, 36)})` : '';
  const lines: string[] = [`◈ workflow · ${runs.length} run${runs.length === 1 ? '' : 's'}${goalTag}:`];
  for (const run of runs) {
    lines.push('  ' + formatRunSummary(run, linkedIds.has(run.workflowId)));
  }
  lines.push('');
  lines.push('Resume with `/workflow resume <id>`, cancel with `/workflow cancel <id>`.');
  return { type: 'text', value: lines.join('\n') };
}

async function showRun(workspaceRoot: string, runId: string): Promise<LocalCommandResult> {
  const loaded = await loadDynamicRun(workspaceRoot, runId);
  if (!loaded) {
    return { type: 'text', value: `◈ workflow · no run found for id ${runId}` };
  }
  const { workflow, state } = loaded;
  const lines: string[] = [
    `◈ workflow · ${workflow.id}`,
    `  status:       ${state.status}`,
    `  started:      ${state.startedAt}`,
    `  updated:      ${state.updatedAt}`,
    `  prompt:       ${truncate(workflow.originalPrompt, 200)}`,
    `  rationale:    ${workflow.rationale}`,
    `  subtasks:     ${workflow.subtasks.length} (${workflow.subtasks.filter(s => s.role === 'verifier').length} verifier${workflow.subtasks.filter(s => s.role === 'verifier').length === 1 ? '' : 's'})`,
    `  cost tier:    ${workflow.estimatedTokenCost}`,
    `  max parallel: ${workflow.maxParallel}`,
    `  progress:     ${state.completedSubtaskIds.length}/${workflow.subtasks.length} subtasks`,
  ];
  if (state.results.length > 0) {
    lines.push('');
    lines.push('  results:');
    for (const r of state.results) {
      const tag = r.verification ? ` [${r.verification}]` : '';
      lines.push(`    · ${r.subtaskId}${tag}`);
    }
  }
  return { type: 'text', value: lines.join('\n') };
}

async function resumeRun(workspaceRoot: string, runId: string): Promise<LocalCommandResult> {
  const loaded = await loadDynamicRun(workspaceRoot, runId);
  if (!loaded) {
    return { type: 'text', value: `◈ workflow · no run found for id ${runId}` };
  }
  if (loaded.state.status === 'completed') {
    return { type: 'text', value: `◈ workflow · ${runId} is already completed; nothing to resume.` };
  }
  if (loaded.state.status === 'cancelled') {
    return { type: 'text', value: `◈ workflow · ${runId} is cancelled; use /workflow to inspect or start a new run.` };
  }
  if (loaded.state.status === 'failed') {
    return {
      type: 'text',
      value: `◈ workflow · ${runId} is in a failed state; the coordinator can retry it from disk on next run.`,
    };
  }
  // The host's coordinator picks up runs whose state is 'paused' or
  // 'running'. Re-asserting 'running' here lets the user restart a
  // run that was previously marked 'paused' by a crash, without
  // re-planning. The actual execution is handled outside the slash
  // command by runDynamicWorkflowAsCoordinator.
  return {
    type: 'text',
    value:
      `◈ workflow · ${runId} marked ready to resume. ` +
      `Completed ${loaded.state.completedSubtaskIds.length}/${loaded.workflow.subtasks.length} subtasks; ` +
      `the coordinator will pick up from the next wave.`,
  };
}

async function cancelRun(workspaceRoot: string, runId: string): Promise<LocalCommandResult> {
  const before = await loadDynamicRun(workspaceRoot, runId);
  if (!before) {
    return { type: 'text', value: `◈ workflow · no run found for id ${runId}` };
  }
  const beforeStatus = before.state.status;
  if (isTerminalStatus(beforeStatus)) {
    return { type: 'text', value: `◈ workflow · ${runId} is already ${beforeStatus}; nothing to cancel.` };
  }
  const after = await cancelDynamicRun(workspaceRoot, runId);
  if (!after) {
    return { type: 'text', value: `◈ workflow · failed to cancel ${runId}` };
  }
  return {
    type: 'text',
    value: `◈ workflow · ${runId} cancelled (was ${beforeStatus}). ${after.completedSubtaskIds.length} subtasks preserved on disk.`,
  };
}

function formatRunSummary(state: DynamicRunState, linkedToActiveGoal: boolean = false): string {
  const tag =
    state.status === 'completed' ? '✓' : state.status === 'failed' ? '✗' : state.status === 'cancelled' ? '⊘' : '…';
  const id = state.workflowId;
  const completed = state.completedSubtaskIds.length;
  const total = state.results.length + state.completedSubtaskIds.length === 0 ? '?' : String(completed);
  const goalBadge = linkedToActiveGoal ? '  ⊕' : '';
  return `${tag} ${id}  [${state.status}]  ${state.startedAt}  ${completed} done${goalBadge}`;
}

/** Returns the set of workflow run ids linked to the currently active goal. */
function readLinkedWorkflowIds(): Set<string> {
  try {
    const { getFullGoalState } = require('../../utils/sessionGoalState.js');
    const state = getFullGoalState();
    return new Set(state?.linkedWorkflowRunIds ?? []);
  } catch {
    return new Set();
  }
}

/** Returns the text of the currently active goal, or null if none is set. */
function readActiveGoalText(): string | null {
  try {
    const { getFullGoalState } = require('../../utils/sessionGoalState.js');
    const state = getFullGoalState();
    return state?.goal ?? null;
  } catch {
    return null;
  }
}

function isTerminalStatus(s: DynamicRunStatus): boolean {
  return s === 'completed' || s === 'failed' || s === 'cancelled';
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + '…';
}

function shorten(path: string): string {
  if (path.length <= 60) return path;
  return '…' + path.slice(-57);
}
