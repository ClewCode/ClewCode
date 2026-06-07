/**
 * DynamicWorkflowProgress — Live progress display for dynamic workflow runs.
 *
 * Shows wave progression, subtask completion, and verification status.
 * Designed to be embedded in the background-tasks panel or shown as a
 * standalone status line below the prompt.
 *
 * Polls the latest run state from disk (`.claude/runs/<id>/state.json`)
 * so it works even for runs started by background subagents.
 */

import figures from 'figures';
import type * as React from 'react';
import { useEffect, useState } from 'react';
import { listDynamicRuns, loadDynamicRun } from '../agentRuntime/dynamicWorkflowPersistence.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { Box, Text } from '../ink.js';
import { formatDuration } from '../utils/format.js';

type SubTaskInfo = {
  id: string;
  role: string;
  title: string;
  status: 'running' | 'completed' | 'failed' | 'pending';
};

type RunSummary = {
  id: string;
  status: string;
  totalSubtasks: number;
  completed: number;
  refuted: number;
  confirmed: number;
  rationale: string;
  startedAt: string;
  subtasks: SubTaskInfo[];
};

/**
 * Hook that polls `.claude/runs/` for live dynamic workflow runs.
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
            id: s.id,
            role: s.role,
            title: s.title,
            status: completedSet.has(s.id) ? 'completed' : runningSet.has(s.id) ? 'running' : 'pending',
          }));

          summaries.push({
            id: loaded.workflow.id,
            status: state.status,
            totalSubtasks: loaded.workflow.subtasks.length,
            completed: state.completedSubtaskIds.length,
            refuted,
            confirmed,
            rationale: loaded.workflow.rationale,
            startedAt: state.startedAt,
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
  const runningStr = running.length > 0
    ? ` ${running.map(s => `${s.role}`).join(' ')}`
    : '';

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

/**
 * Detailed panel view — shows every running/paused dynamic run with
 * per-subtask progress.
 */
export function DynamicWorkflowPanel({ workspaceRoot }: { workspaceRoot: string }): React.ReactNode {
  const runs = useLiveDynamicRuns(workspaceRoot);

  if (runs.length === 0) {
    return (
      <Box paddingX={1}>
        <Text dimColor>No active dynamic workflow runs.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {runs.map(run => (
        <RunRow key={run.id} run={run} />
      ))}
    </Box>
  );
}

function RunRow({ run }: { run: RunSummary }): React.ReactNode {
  const duration = run.startedAt ? formatDuration(Date.now() - new Date(run.startedAt).getTime()) : '';

  const statusLines = run.subtasks.map(s => {
    const glyph = s.status === 'running' ? '⟐' : s.status === 'completed' ? '✓' : s.status === 'failed' ? '✗' : '·';
    const color = s.status === 'running' ? 'suggestion' : s.status === 'completed' ? 'success' : s.status === 'failed' ? 'error' : 'subtle';
    return (
      <Box key={s.id} paddingLeft={2}>
        <Text color={color}>{glyph}</Text>
        <Text> </Text>
        <Text color={color} bold={s.status === 'running'}>{s.role}</Text>
        <Text dimColor>: {s.title.length > 60 ? `${s.title.slice(0, 60)}…` : s.title}</Text>
      </Box>
    );
  });

  return (
    <Box flexDirection="column" paddingX={1} paddingY={0}>
      <Box>
        <Text>{run.status === 'running' ? figures.play : figures.square}</Text>
        <Text> </Text>
        <Text bold>ultracode</Text>
        <Text> </Text>
        <Text dimColor>{run.id}</Text>
      </Box>
      {statusLines}
      <Box paddingLeft={2}>
        <Text dimColor>
          {run.completed}/{run.totalSubtasks} subtasks
          {run.refuted > 0 ? ` · ${run.refuted} refuted` : ''}
          {run.confirmed > 0 ? ` · ${run.confirmed} confirmed` : ''}
          {' · '}
          {duration}
        </Text>
      </Box>
      {run.rationale ? (
        <Box paddingLeft={2}>
          <Text dimColor>{run.rationale.length > 80 ? `${run.rationale.slice(0, 80)}…` : run.rationale}</Text>
        </Box>
      ) : null}
    </Box>
  );
}
