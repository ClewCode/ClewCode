import type * as React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getProjectRoot } from '../bootstrap/state.js';
import { Box, Text } from '../ink.js';
import { getAutonomousStatus } from '../services/autonomous/supervisorIntegration.js';
import {
  listTasks,
  loadQueue,
  readTaskLog,
  type TaskQueueEntry,
  watchQueue,
} from '../services/autonomous/taskQueue.js';
import { formatDuration, truncateToWidth } from '../utils/format.js';
import { getFullGoalState } from '../utils/sessionGoalState.js';
import { ProgressBar } from './design-system/ProgressBar.js';
import { OffscreenFreeze } from './OffscreenFreeze.js';

type Props = {
  goal?: string;
  goalStartedAt?: number;
  goalTurns?: number;
  isLoading: boolean;
};

type DaemonSnapshot = {
  running: boolean;
  enabled: boolean;
  currentTaskTitle?: string;
};

const MAX_VISIBLE_TASKS = 8;
const MAX_LOG_LINES = 5;
const MAX_COLLAPSED_COMPLETED = 4;

/** A task is considered stale if it has been pending for more than 1 hour */
const STALE_THRESHOLD_MS = 60 * 60 * 1000;

function isBudgetStopped(reason: string | undefined): boolean {
  return /(?:turn|time) limit reached/i.test(reason ?? '');
}

function isStaleTask(task: TaskQueueEntry): boolean {
  if (task.status === 'completed' || task.status === 'in_progress') return false;
  const start = task.startedAt ?? task.createdAt;
  return Date.now() - start > STALE_THRESHOLD_MS;
}

function statusGlyph(task: TaskQueueEntry): { glyph: string; color: 'success' | 'warning' | 'error' | 'suggestion' } {
  switch (task.status) {
    case 'completed':
      return { glyph: 'done', color: 'success' };
    case 'in_progress':
      return { glyph: 'run', color: 'suggestion' };
    case 'failed':
    case 'dead_letter':
    case 'cancelled':
      return { glyph: 'fail', color: 'error' };
    default:
      // Stale pending tasks get a warning indicator
      if (isStaleTask(task)) {
        return { glyph: 'warn', color: 'warning' };
      }
      return { glyph: 'wait', color: 'warning' };
  }
}

function taskAge(task: TaskQueueEntry): string {
  const start = task.startedAt ?? task.createdAt;
  return formatDuration(Date.now() - start, { hideTrailingZeros: true });
}

function getVisibleTasks(tasks: TaskQueueEntry[]): TaskQueueEntry[] {
  const active = tasks.filter(t => t.status === 'in_progress');
  const blocked = tasks.filter(t => t.status === 'failed' || t.status === 'dead_letter');
  const pending = tasks.filter(t => t.status === 'pending').slice(0, 3);
  const completed = tasks
    .filter(t => t.status === 'completed')
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
    .slice(0, MAX_COLLAPSED_COMPLETED);

  return [...active, ...blocked, ...pending, ...completed].slice(0, MAX_VISIBLE_TASKS);
}

function LogPreview({ taskId }: { taskId: string }) {
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const log = await readTaskLog(taskId);
      if (cancelled) return;
      setLines(
        log
          .split('\n')
          .map(line => line.trimEnd())
          .filter(Boolean)
          .slice(-MAX_LOG_LINES),
      );
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 2000);
    timer.unref();
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [taskId]);

  if (!lines.length) {
    return <Text dimColor> waiting for worker output...</Text>;
  }

  return (
    <Box flexDirection="column">
      {lines.map(line => (
        <Text key={`${taskId}-${line}`} dimColor>
          {'    '}
          {truncateToWidth(line, 110)}
        </Text>
      ))}
    </Box>
  );
}

function TaskRow({ task }: { task: TaskQueueEntry }) {
  const status = statusGlyph(task);
  const isActive = task.status === 'in_progress';
  const isCompleted = task.status === 'completed';
  const stale = isStaleTask(task);
  const meta = isCompleted
    ? task.completedAt
      ? `done ${taskAge(task)}`
      : 'done'
    : `${task.priority} · ${taskAge(task)}${stale ? ' (stale)' : ''}`;

  return (
    <Box flexDirection="column">
      <Text>
        <Text color={status.color}>{status.glyph}</Text>{' '}
        <Text bold={isActive} dimColor={isCompleted || stale} strikethrough={isCompleted}>
          {truncateToWidth(task.title, 72)}
        </Text>
        <Text dimColor={!stale} color={stale ? 'warning' : undefined}>
          {' · '}
          {meta}
        </Text>
      </Text>
      {isActive && task.description ? (
        <Text dimColor>
          {'  '}↳ {truncateToWidth(task.description, 100)}
        </Text>
      ) : null}
      {isActive ? <LogPreview taskId={task.id} /> : null}
      {(task.status === 'failed' || task.status === 'dead_letter') && (task.lastError || task.error) ? (
        <Text color="error">
          {'  '}
          {truncateToWidth(task.lastError ?? task.error ?? '', 100)}
        </Text>
      ) : null}
    </Box>
  );
}

/** Render a goal progress section with progress bars */
function GoalProgressSection({
  goalTurns,
  elapsed,
  isLoading,
}: {
  goalTurns: number | undefined;
  elapsed: string | null;
  isLoading: boolean;
}): React.ReactNode {
  const goalState = getFullGoalState();
  const turns = goalTurns ?? 0;
  const isPaused = goalState?.paused ?? false;
  const tokens = goalState?.evalTokens ?? 0;

  // Compute time-based progress
  let timeProgress: { elapsed: number; max: number } | null = null;
  if (goalState?.maxMinutes && goalState.setAt) {
    const totalPausedMs = goalState.totalPausedMs ?? 0;
    const activeElapsedMs = Date.now() - goalState.setAt - totalPausedMs;
    timeProgress = {
      elapsed: activeElapsedMs / 60_000,
      max: goalState.maxMinutes,
    };
  }

  // Achievement banner
  if (goalState?.achieved) {
    return (
      <Box flexDirection="column">
        <Text color="success">Goal achieved</Text>
        <Text dimColor>{goalState.goal}</Text>
        {goalState.chain && goalState.chain.length > 0 ? (
          <Text bold>Next: {goalState.chain[0]}</Text>
        ) : (
          <Text dimColor>Use /goal clear to dismiss</Text>
        )}
      </Box>
    );
  }

  if (goalState?.blocked) {
    const reason = goalState.blockedReason ?? goalState.lastReason;
    const statusLabel = isBudgetStopped(reason) ? 'Goal stopped' : 'Goal blocked';
    return (
      <Box flexDirection="column">
        <Text color="warning">{statusLabel}</Text>
        <Text dimColor>{goalState.goal}</Text>
        {reason ? (
          <Text dimColor>
            {'  '}
            {truncateToWidth(reason, 100)}
          </Text>
        ) : null}
        <Text dimColor>{'  '}/goal edit &lt;text&gt; to continue, or /goal clear to dismiss</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {/* Turn progress bar */}
      {goalState?.maxTurns ? (
        <Box flexDirection="row" gap={1} alignItems="center">
          <Text dimColor> Turns</Text>
          <ProgressBar
            ratio={turns / goalState.maxTurns}
            width={20}
            fillColor={
              turns / goalState.maxTurns > 0.85 ? 'error' : turns / goalState.maxTurns > 0.65 ? 'warning' : 'suggestion'
            }
          />
          <Text dimColor>
            {turns}/{goalState.maxTurns}
          </Text>
        </Box>
      ) : null}

      {/* Time progress bar */}
      {timeProgress ? (
        <Box flexDirection="row" gap={1} alignItems="center">
          <Text dimColor> Time </Text>
          <ProgressBar
            ratio={timeProgress.elapsed / timeProgress.max}
            width={20}
            fillColor={
              timeProgress.elapsed / timeProgress.max > 0.85
                ? 'error'
                : timeProgress.elapsed / timeProgress.max > 0.65
                  ? 'warning'
                  : 'suggestion'
            }
          />
          <Text dimColor>
            {Math.round(timeProgress.elapsed)}/{timeProgress.max}m
          </Text>
        </Box>
      ) : null}

      {/* Chain progress */}
      {goalState?.chain && goalState.chain.length > 0 ? (
        <Text dimColor>
          {'  '}Chain: {goalState.chain.map((g, i) => `${i + 2}. ${truncateToWidth(g, 30)}`).join(' -> ')}
        </Text>
      ) : null}

      {/* Evaluator feedback */}
      {goalState?.lastReason ? (
        <Text dimColor>
          {'  '}Evaluator: {truncateToWidth(goalState.lastReason, 100)}
        </Text>
      ) : null}

      {/* Eval stats */}
      {tokens > 0 ? (
        <Text dimColor>
          {'  '}Eval tokens: {tokens.toLocaleString()}
        </Text>
      ) : null}

      {/* Status line */}
      <Box>
        {isPaused ? (
          <Text color="warning">Goal paused - /goal resume to continue</Text>
        ) : (
          <>
            {isLoading ? <Text color="suggestion">Working</Text> : <Text dimColor>Idle</Text>}
            <Text dimColor>
              {' '}
              {isLoading ? 'Working toward goal' : 'Goal not yet met'}
              {elapsed ? ` | ${elapsed}` : ''}
              {turns > 0 ? ` | ${turns} turn${turns === 1 ? '' : 's'}` : ''}
              {isLoading ? ' | esc to interrupt' : ' | continuing'}
            </Text>
          </>
        )}
      </Box>
    </Box>
  );
}

export function AutonomousExecutionAccordion({ goal, goalStartedAt, goalTurns, isLoading }: Props): React.ReactNode {
  const [tasks, setTasks] = useState<TaskQueueEntry[]>([]);
  const [daemon, setDaemon] = useState<DaemonSnapshot | null>(null);

  const refresh = useCallback(async () => {
    await loadQueue();
    setTasks(listTasks({ limit: 50 }));
    const status = await getAutonomousStatus();
    setDaemon({
      running: status.running,
      enabled: status.enabled,
      currentTaskTitle: status.agent?.currentTaskTitle,
    });
  }, []);

  useEffect(() => {
    void refresh();
    const unwatch = watchQueue(() => {
      setTasks(listTasks({ limit: 50 }));
    });
    const timer = setInterval(() => void refresh(), 3000);
    timer.unref();
    return () => {
      unwatch();
      clearInterval(timer);
    };
  }, [refresh]);

  const projectTasks = useMemo(() => {
    const projectRoot = getProjectRoot();
    return tasks.filter(t => t.projectRoot === projectRoot);
  }, [tasks]);

  const visibleTasks = useMemo(() => getVisibleTasks(projectTasks), [projectTasks]);
  const active = Boolean(goal) || Boolean(daemon?.running) || visibleTasks.length > 0;
  if (!active) return null;

  const completedCount = projectTasks.filter(t => t.status === 'completed').length;
  const activeCount = projectTasks.filter(t => t.status === 'in_progress').length;
  const pendingCount = projectTasks.filter(t => t.status === 'pending').length;
  const failedCount = projectTasks.filter(t => t.status === 'failed' || t.status === 'dead_letter').length;
  const openCount = activeCount + pendingCount + failedCount;
  const collapsedCompletedCount = visibleTasks.filter(t => t.status === 'completed').length;
  const hiddenCompletedCount = Math.max(0, completedCount - collapsedCompletedCount);
  const elapsed = goalStartedAt ? formatDuration(Date.now() - goalStartedAt, { hideTrailingZeros: true }) : null;

  return (
    <OffscreenFreeze>
      <Box flexDirection="column" marginTop={1}>
        {/* ── Goal header ──────────────────────────────────────────── */}
        {goal ? (
          <Box flexDirection="column">
            <Text>
              <Text color="suggestion">Goal</Text>
              <Text bold> Goal: </Text>
              <Text>{truncateToWidth(goal, 90)}</Text>
            </Text>
            {projectTasks.length > 0 || daemon?.running || daemon?.enabled ? (
              <Text dimColor>
                {'  '}
                {projectTasks.length} task{projectTasks.length === 1 ? '' : 's'}
                {completedCount > 0 ? ` · ${completedCount} done` : ''}
                {openCount > 0 ? ` · ${openCount} open` : ''}
                {daemon?.running ? ' · daemon online' : daemon?.enabled ? ' · daemon enabled' : ''}
              </Text>
            ) : null}
          </Box>
        ) : daemon?.running || daemon?.enabled || visibleTasks.length > 0 ? (
          <Text dimColor>
            {projectTasks.length} task{projectTasks.length === 1 ? '' : 's'} ({completedCount} done, {openCount} open)
            {daemon?.running ? ' · daemon online' : daemon?.enabled ? ' · daemon enabled' : ''}
          </Text>
        ) : null}

        {/* ── Current daemon task ──────────────────────────────────── */}
        {daemon?.currentTaskTitle && !visibleTasks.some(t => t.title === daemon.currentTaskTitle) ? (
          <Text color="suggestion">◉ {truncateToWidth(daemon.currentTaskTitle, 90)}</Text>
        ) : null}

        {/* ── Task list ────────────────────────────────────────────── */}
        {visibleTasks.length > 0 ? (
          <Box flexDirection="column" marginTop={1}>
            {visibleTasks.map(task => (
              <TaskRow key={task.id} task={task} />
            ))}
            {hiddenCompletedCount > 0 ? (
              <Text dimColor>
                {'  '}… +{hiddenCompletedCount} completed
              </Text>
            ) : null}
          </Box>
        ) : null}

        {/* ── Goal progress / idle status ──────────────────────────── */}
        {goal ? (
          <GoalProgressSection goalTurns={goalTurns} elapsed={elapsed} isLoading={isLoading} />
        ) : visibleTasks.length === 0 ? (
          <Text dimColor>✓ No queued daemon tasks</Text>
        ) : null}
      </Box>
    </OffscreenFreeze>
  );
}
