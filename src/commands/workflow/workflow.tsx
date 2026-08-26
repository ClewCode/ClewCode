/**
 * `/workflow` slash command with Interactive JSX UI and CLI fallback.
 */

import React from 'react';
import {
  cancelDynamicRun,
  type DynamicRunState,
  type DynamicRunStatus,
  listAllDynamicRuns,
  loadDynamicRun,
} from '../../agentRuntime/dynamicWorkflowPersistence.js';
import { WorkflowCatalogView } from '../../components/workflowCatalog/WorkflowCatalogView.js';
import type { LocalJSXCommandCall, LocalJSXCommandContext, LocalJSXCommandOnDone } from '../../types/command.js';
import { getCwd } from '../../utils/cwd.js';

const VERB_SHOW = new Set(['show', 'view', 'inspect']);
const VERB_RESUME = new Set(['resume', 'continue', 'start']);
const VERB_CANCEL = new Set(['cancel', 'stop', 'abort', 'kill']);

export const call: LocalJSXCommandCall = async (
  onDone: LocalJSXCommandOnDone,
  _context: LocalJSXCommandContext,
  args: string,
): Promise<React.ReactNode> => {
  const trimmed = (args ?? '').trim();
  const tokens = trimmed ? trimmed.split(/\s+/) : [];
  const verbRaw = (tokens[0] || '').toLowerCase();
  const rest = tokens.slice(1).join(' ').trim();

  const workspaceRoot = resolveWorkspaceRoot();

  // Show detailed text summary if explicitly requested via CLI args
  if (VERB_SHOW.has(verbRaw)) {
    if (!rest) {
      onDone('Usage: /workflow show <runId>');
      return null;
    }
    const res = await showRun(workspaceRoot, rest);
    onDone(res);
    return null;
  }

  // Resume workflow run
  if (VERB_RESUME.has(verbRaw)) {
    if (!rest) {
      onDone('Usage: /workflow resume <runId>');
      return null;
    }
    const res = await resumeRun(workspaceRoot, rest);
    onDone(res);
    return null;
  }

  // Cancel workflow run
  if (VERB_CANCEL.has(verbRaw)) {
    if (!rest) {
      onDone('Usage: /workflow cancel <runId>');
      return null;
    }
    const res = await cancelRun(workspaceRoot, rest);
    onDone(res);
    return null;
  }

  // If arguments provided were invalid
  if (trimmed && verbRaw !== 'list' && verbRaw !== 'ls' && verbRaw !== '--interactive' && verbRaw !== '-i') {
    onDone(
      'Usage:\n' +
        '  /workflow                interactive catalog of dynamic workflow runs\n' +
        '  /workflow show <id>      show plan + results for a run\n' +
        '  /workflow resume <id>    mark a paused run as ready to resume\n' +
        '  /workflow cancel <id>    cancel a running or paused run',
    );
    return null;
  }

  // Default interactive TUI view
  return (
    <WorkflowCatalogView
      onDone={result => onDone(result, result ? { display: 'system' } : { display: 'skip' })}
      onResume={runId => onDone(undefined, { nextInput: `/workflow resume ${runId}`, submitNextInput: true })}
    />
  );
};

export function isEnabled(): boolean {
  return true;
}

function resolveWorkspaceRoot(): string {
  const override = (globalThis as { __workflowWorkspaceRoot?: string }).__workflowWorkspaceRoot;
  if (override) return override;
  try {
    return getCwd();
  } catch {
    return process.cwd();
  }
}

async function showRun(workspaceRoot: string, runId: string): Promise<string> {
  const loaded = await loadDynamicRun(workspaceRoot, runId);
  if (!loaded) {
    return `◈ workflow · no run found for id ${runId}`;
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
  return lines.join('\n');
}

async function resumeRun(workspaceRoot: string, runId: string): Promise<string> {
  const loaded = await loadDynamicRun(workspaceRoot, runId);
  if (!loaded) {
    return `◈ workflow · no run found for id ${runId}`;
  }
  if (loaded.state.status === 'completed') {
    return `◈ workflow · ${runId} is already completed; nothing to resume.`;
  }
  if (loaded.state.status === 'cancelled') {
    return `◈ workflow · ${runId} is cancelled; use /workflow to inspect or start a new run.`;
  }
  if (loaded.state.status === 'failed') {
    return `◈ workflow · ${runId} is in a failed state; the coordinator can retry it from disk on next run.`;
  }
  return (
    `◈ workflow · ${runId} marked ready to resume. ` +
    `Completed ${loaded.state.completedSubtaskIds.length}/${loaded.workflow.subtasks.length} subtasks; ` +
    `the coordinator will pick up from the next wave.`
  );
}

async function cancelRun(workspaceRoot: string, runId: string): Promise<string> {
  const before = await loadDynamicRun(workspaceRoot, runId);
  if (!before) {
    return `◈ workflow · no run found for id ${runId}`;
  }
  const beforeStatus = before.state.status;
  if (isTerminalStatus(beforeStatus)) {
    return `◈ workflow · ${runId} is already ${beforeStatus}; nothing to cancel.`;
  }
  const after = await cancelDynamicRun(workspaceRoot, runId);
  if (!after) {
    return `◈ workflow · failed to cancel ${runId}`;
  }
  return `◈ workflow · ${runId} cancelled (was ${beforeStatus}). ${after.completedSubtaskIds.length} subtasks preserved on disk.`;
}

function isTerminalStatus(s: DynamicRunStatus): boolean {
  return s === 'completed' || s === 'failed' || s === 'cancelled';
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}
