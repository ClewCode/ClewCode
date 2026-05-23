import type * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
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

function statusGlyph(task: TaskQueueEntry): { glyph: string; color: 'success' | 'warning' | 'error' | 'suggestion' } {
  switch (task.status) {
    case 'completed':
      return { glyph: '■', color: 'success' };
    case 'in_progress':
      return { glyph: '▾', color: 'suggestion' };
    case 'failed':
    case 'dead_letter':
    case 'cancelled':
      return { glyph: '×', color: 'error' };
    default:
      return { glyph: '□', color: 'warning' };
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
      {lines.map((line, index) => (
        <Text key={`${taskId}-${index}`} dimColor>
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
  const meta = isCompleted
    ? task.completedAt
      ? `done ${taskAge(task)}`
      : 'done'
    : `${task.priority} · ${taskAge(task)}`;

  return (
    <Box flexDirection="column">
      <Text>
        <Text color={status.color}>{status.glyph}</Text>{' '}
        <Text bold={isActive} dimColor={isCompleted} strikethrough={isCompleted}>
          {truncateToWidth(task.title, 72)}
        </Text>
        <Text dimColor> · {meta}</Text>
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

export function AutonomousExecutionAccordion({ goal, goalStartedAt, goalTurns, isLoading }: Props): React.ReactNode {
  const [tasks, setTasks] = useState<TaskQueueEntry[]>([]);
  const [daemon, setDaemon] = useState<DaemonSnapshot | null>(null);

  const refresh = async () => {
    await loadQueue();
    setTasks(listTasks({ limit: 50 }));
    const status = await getAutonomousStatus();
    setDaemon({
      running: status.running,
      enabled: status.enabled,
      currentTaskTitle: status.agent?.currentTaskTitle,
    });
  };

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
  }, []);

  const visibleTasks = useMemo(() => getVisibleTasks(tasks), [tasks]);
  const active = Boolean(goal) || Boolean(daemon?.running) || visibleTasks.length > 0;
  if (!active) return null;

  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const activeCount = tasks.filter(t => t.status === 'in_progress').length;
  const pendingCount = tasks.filter(t => t.status === 'pending').length;
  const failedCount = tasks.filter(t => t.status === 'failed' || t.status === 'dead_letter').length;
  const openCount = activeCount + pendingCount + failedCount;
  const collapsedCompletedCount = visibleTasks.filter(t => t.status === 'completed').length;
  const hiddenCompletedCount = Math.max(0, completedCount - collapsedCompletedCount);
  const elapsed = goalStartedAt ? formatDuration(Date.now() - goalStartedAt, { hideTrailingZeros: true }) : null;

  return (
    <OffscreenFreeze>
      <Box flexDirection="column" marginTop={1}>
        {goal ? (
          <Text>
            <Text color="suggestion">◎</Text>
            <Text> Goal set: </Text>
            <Text bold>{truncateToWidth(goal, 96)}</Text>
          </Text>
        ) : null}
        {daemon?.running || daemon?.enabled || visibleTasks.length > 0 ? (
          <Text dimColor>
            {tasks.length} tasks ({completedCount} done, {openCount} open)
            {daemon?.running ? ' · daemon online' : daemon?.enabled ? ' · daemon enabled' : ''}
          </Text>
        ) : null}
        {daemon?.currentTaskTitle && !visibleTasks.some(t => t.title === daemon.currentTaskTitle) ? (
          <Text color="suggestion">▾ {truncateToWidth(daemon.currentTaskTitle, 90)}</Text>
        ) : null}
        {visibleTasks.length > 0 ? (
          <Box flexDirection="column" marginTop={1}>
            {visibleTasks.map(task => (
              <TaskRow key={task.id} task={task} />
            ))}
            {hiddenCompletedCount > 0 ? <Text dimColor>... +{hiddenCompletedCount} completed</Text> : null}
          </Box>
        ) : null}
        {goal ? (
          <Text dimColor>
            {isLoading ? <Text color="warning">✣</Text> : <Text>○</Text>}{' '}
            {isLoading ? 'Claude is working toward the goal...' : 'Goal not yet met... continuing'}
            {elapsed ? ` (${elapsed}` : ''}
            {goalTurns !== undefined ? ` · ${goalTurns} turns` : ''}
            {elapsed ? ' · esc to interrupt)' : ''}
          </Text>
        ) : visibleTasks.length === 0 ? (
          <Text dimColor>✓ No queued daemon tasks</Text>
        ) : null}
      </Box>
    </OffscreenFreeze>
  );
}
