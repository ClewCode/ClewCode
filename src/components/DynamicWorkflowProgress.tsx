/**
 * DynamicWorkflowProgress — Live progress display for dynamic workflow runs.
 *
 * Shows wave progression, subtask completion, and verification status.
 * Designed to be embedded in the background-tasks panel or shown as a
 * standalone status line below the prompt.
 *
 * Polls the latest run state from disk (`.clew/runs/<id>/state.json`)
 * so it works even for runs started by background subagents.
 */

import figures from 'figures';
import type * as React from 'react';
import { useEffect, useState } from 'react';
import { listDynamicRuns, loadDynamicRun } from '../agentRuntime/dynamicWorkflowPersistence.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { Box, Text } from '../ink.js';

type SubTaskInfo = {
  role: string;
  status: 'running' | 'completed' | 'pending';
};

type RunSummary = {
  status: string;
  totalSubtasks: number;
  completed: number;
  refuted: number;
  confirmed: number;
  subtasks: SubTaskInfo[];
};

/**
 * Hook that polls `.clew/runs/` for live dynamic workflow runs.
 * Returns a sorted list (most recent first) of active runs.
 * Polls every 3 seconds while runs are running.
 */
function useLiveDynamicRuns(workspaceRoot: string): RunSummary[] {
  const [runs, setRuns] = useState<RunSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    async function poll(): Promise<void> {
      if (cancelled) return;
      try {
        const states = await listDynamicRuns(workspaceRoot);
        const summaries: RunSummary[] = [];

        for (const state of states) {
          const loaded = await loadDynamicRun(workspaceRoot, state.runId);
          if (!loaded) continue;
          const refuted = state.results.filter(r => r.verification === 'refuted').length;
          const confirmed = state.results.filter(r => r.verification === 'confirmed').length;

          const completedSet = new Set(state.completedSubtaskIds);
          const runningSet = new Set(state.runningSubtaskIds ?? []);
          const subtasks: SubTaskInfo[] = loaded.workflow.subtasks.map(s => ({
            role: s.role,
            status: completedSet.has(s.id) ? 'completed' : runningSet.has(s.id) ? 'running' : 'pending',
          }));

          summaries.push({
            status: state.status,
            totalSubtasks: loaded.workflow.subtasks.length,
            completed: state.completedSubtaskIds.length,
            refuted,
            confirmed,
            subtasks,
          });
        }

        if (!cancelled) setRuns(summaries);

        const hasActive = summaries.some(r => r.status === 'running' || r.status === 'planning');
        if (hasActive) {
          pollTimer = setTimeout(poll, 3_000);
        }
      } catch {
        if (!cancelled) {
          pollTimer = setTimeout(poll, 5_000);
        }
      }
    }

    void poll();
    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [workspaceRoot]);

  return runs;
}

/**
 * Compact one-line status display. Suitable for embedding in the
 * prompt footer or the background-tasks panel.
 *
 * When there are no active runs, returns null (renders nothing).
 *
 * Gets workspace root from process.cwd() by default.
 */
export function DynamicWorkflowStatusLine({
  workspaceRoot = process.cwd(),
}: {
  workspaceRoot?: string;
}): React.ReactNode {
  const runs = useLiveDynamicRuns(workspaceRoot);
  const termWidth = useTerminalSize().columns;

  if (runs.length === 0) return null;

  const run = runs[0]!;

  const statusGlyph =
    run.status === 'running'
      ? '◈'
      : run.status === 'planning'
        ? '⟐'
        : run.status === 'completed'
          ? '✓'
          : run.status === 'failed'
            ? '✗'
            : '…';

  // Show running subtasks in status line
  const running = run.subtasks.filter(s => s.status === 'running');
  const runningStr = running.length > 0 ? ` ${running.map(s => `${s.role}`).join(' ')}` : '';

  const parts: string[] = [`${statusGlyph} ultracode`, `[${run.completed}/${run.totalSubtasks}]${runningStr}`];

  if (run.refuted > 0) {
    parts.push(`${figures.cross}${run.refuted}`);
  }
  if (run.confirmed > 0) {
    parts.push(`${figures.tick}${run.confirmed}`);
  }

  const line = parts.join(' ');
  const maxWidth = termWidth - 4;

  return (
    <Box paddingX={1}>
      <Text bold dimColor>
        {line.length > maxWidth ? `${line.slice(0, maxWidth)}…` : line}
      </Text>
    </Box>
  );
}
