/**
 * DashboardMonitor - real-time agent, daemon, and task execution monitor.
 */

import figures from 'figures';
import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RunStore } from '../../agentRuntime/runStore.js';
import type { AgentRun, RuntimeEvent } from '../../agentRuntime/types.js';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
import { Box, Text, useInput } from '../../ink.js';
import {
  getAutonomousStatus,
  startAutonomousAgent,
  stopAutonomousAgent,
} from '../../services/autonomous/supervisorIntegration.js';
import {
  getQueueStats,
  listTasks,
  loadQueue,
  readTaskLog,
  type TaskQueueEntry,
  watchQueue,
} from '../../services/autonomous/taskQueue.js';
import { Divider } from '../design-system/Divider.js';
import { ProgressBar } from '../design-system/ProgressBar.js';
import { StatusIcon } from '../design-system/StatusIcon.js';

type MonitorTab = 'queue' | 'agents' | 'timeline';

type AgentRunDisplay = {
  id: string;
  agentName: string;
  status: AgentRun['status'];
  task: string;
  step: number;
  maxSteps: number;
  updatedAt: number;
  costUsd: number;
  tokens: number;
};

type QueueStats = ReturnType<typeof getQueueStats>;

function parseTime(value: string | number | undefined): number {
  if (typeof value === 'number') return value;
  if (!value) return Date.now();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function formatAge(ts: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 100) / 10}K`;
  return String(tokens);
}

function formatCost(costUsd: number): string {
  if (!Number.isFinite(costUsd) || costUsd <= 0) return '$0.00';
  if (costUsd < 0.01) return '<$0.01';
  return `$${costUsd.toFixed(2)}`;
}

function truncate(text: string, width: number): string {
  if (width <= 0) return '';
  if (text.length <= width) return text;
  if (width <= 3) return text.slice(0, width);
  return `${text.slice(0, width - 3)}...`;
}

function eventTokens(event: RuntimeEvent): number {
  const data = event.data ?? {};
  const usage = (data.usage ?? data.tokenUsage ?? data.tokens) as Record<string, unknown> | number | undefined;
  if (typeof usage === 'number') return usage;
  if (!usage || typeof usage !== 'object') {
    const direct = data.totalTokens ?? data.tokenCount ?? data.inputTokens ?? data.outputTokens;
    return typeof direct === 'number' ? direct : 0;
  }
  const total = usage.totalTokens ?? usage.total_tokens ?? usage.total;
  if (typeof total === 'number') return total;
  const input = usage.inputTokens ?? usage.input_tokens ?? 0;
  const output = usage.outputTokens ?? usage.output_tokens ?? 0;
  return (typeof input === 'number' ? input : 0) + (typeof output === 'number' ? output : 0);
}

function eventCost(event: RuntimeEvent): number {
  const data = event.data ?? {};
  const direct = data.costUsd ?? data.cost_usd ?? data.cost;
  return typeof direct === 'number' ? direct : 0;
}

function statusColor(status: AgentRun['status']): string {
  switch (status) {
    case 'running':
    case 'testing':
      return 'success';
    case 'queued':
    case 'planning':
    case 'reviewing':
    case 'waiting_approval':
      return 'warning';
    case 'completed':
      return 'success';
    case 'failed':
    case 'cancelled':
      return 'error';
    default:
      return 'text';
  }
}

function statusIcon(status: AgentRun['status']): 'success' | 'error' | 'warning' | 'pending' | 'loading' {
  switch (status) {
    case 'running':
    case 'testing':
      return 'loading';
    case 'completed':
      return 'success';
    case 'failed':
    case 'cancelled':
      return 'error';
    case 'queued':
    case 'planning':
    case 'reviewing':
    case 'waiting_approval':
      return 'warning';
    default:
      return 'pending';
  }
}

function taskStatusIcon(status: TaskQueueEntry['status']): 'success' | 'error' | 'warning' | 'pending' | 'loading' {
  switch (status) {
    case 'in_progress':
      return 'loading';
    case 'completed':
      return 'success';
    case 'failed':
    case 'dead_letter':
    case 'cancelled':
      return 'error';
    case 'pending':
      return 'warning';
    default:
      return 'pending';
  }
}

function taskStartedAt(task: TaskQueueEntry): number {
  return task.startedAt ?? task.scheduledAt ?? task.createdAt;
}

function buildTaskTimeline(tasks: TaskQueueEntry[]): RuntimeEvent[] {
  return tasks.slice(0, 20).map(task => ({
    id: `task-${task.id}`,
    runId: task.agentId ?? task.id,
    type:
      task.status === 'completed'
        ? 'run.completed'
        : task.status === 'failed' || task.status === 'dead_letter' || task.status === 'cancelled'
          ? 'run.failed'
          : task.status === 'in_progress'
            ? 'agent.started'
            : 'run.started',
    timestamp: new Date(task.completedAt ?? taskStartedAt(task)).toISOString(),
    agent: task.agentId,
    data: { title: task.title, status: task.status },
  }));
}

function AgentRow({ run, width }: { run: AgentRunDisplay; width: number }) {
  const ratio = run.maxSteps > 0 ? Math.min(1, run.step / run.maxSteps) : 0;
  const titleWidth = Math.max(18, width - 54);

  return (
    <Box flexDirection="column">
      <Box>
        <StatusIcon status={statusIcon(run.status)} />
        <Text color={statusColor(run.status)} bold>
          {' '}
          {truncate(run.agentName, 18)}
        </Text>
        <Text dimColor> {truncate(run.task, titleWidth)}</Text>
      </Box>
      <Box marginLeft={2}>
        <ProgressBar ratio={ratio} width={16} />
        <Text dimColor>
          {' '}
          {run.step}/{run.maxSteps} | {formatAge(run.updatedAt)} | {formatTokens(run.tokens)} tok |{' '}
          {formatCost(run.costUsd)}
        </Text>
      </Box>
    </Box>
  );
}

function QueueRow({ task, width }: { task: TaskQueueEntry; width: number }) {
  const titleWidth = Math.max(12, width - 45);
  return (
    <Box>
      <StatusIcon status={taskStatusIcon(task.status)} />
      <Text color={task.status === 'in_progress' ? 'suggestion' : task.status === 'pending' ? 'warning' : undefined}>
        {' '}
        {task.status.padEnd(11)}
      </Text>
      <Text>{truncate(task.title, titleWidth)}</Text>
      <Text dimColor>
        {' '}
        {task.priority} | {formatAge(taskStartedAt(task))}
      </Text>
    </Box>
  );
}

function TimelineRow({ event, width }: { event: RuntimeEvent; width: number }) {
  const label = event.agent ?? event.tool ?? event.runId;
  const title = typeof event.data?.title === 'string' ? event.data.title : '';
  return (
    <Box>
      <Text dimColor>{formatAge(parseTime(event.timestamp)).padStart(4)} </Text>
      <Text
        color={event.type.includes('failed') ? 'error' : event.type.includes('completed') ? 'success' : 'suggestion'}
      >
        {figures.pointer} {event.type.padEnd(16)}
      </Text>
      <Text dimColor> {truncate(label, 18)}</Text>
      {title && <Text> {truncate(title, Math.max(8, width - 48))}</Text>}
    </Box>
  );
}

export function DashboardMonitor(_props: { onDone?: unknown } = {}): React.ReactElement {
  const { columns } = useTerminalSize();
  const [activeTab, setActiveTab] = useState<MonitorTab>('queue');
  const [agentRuns, setAgentRuns] = useState<AgentRunDisplay[]>([]);
  const [queueEntries, setQueueEntries] = useState<TaskQueueEntry[]>([]);
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null);
  const [timeline, setTimeline] = useState<RuntimeEvent[]>([]);
  const [selectedTaskIndex, setSelectedTaskIndex] = useState(0);
  const [selectedLog, setSelectedLog] = useState<string[]>([]);
  const [autonomousRunning, setAutonomousRunning] = useState(false);

  const width = Math.max(64, columns - 6);

  const refreshRuns = useCallback(async () => {
    const store = new RunStore(process.cwd());
    const runs = await store.listRuns();
    const displays: AgentRunDisplay[] = [];
    const eventsForTimeline: RuntimeEvent[] = [];

    for (const run of runs.slice(0, 30)) {
      const [state, events] = await Promise.all([
        store.loadState(run.id).catch(() => null),
        store.loadEvents(run.id).catch(() => []),
      ]);
      const tokens = events.reduce((total, event) => total + eventTokens(event), 0);
      const costUsd = events.reduce((total, event) => total + eventCost(event), 0);
      const updatedAt = parseTime(run.updatedAt);
      displays.push({
        id: run.id,
        agentName: state?.activeAgent ?? run.activeAgent ?? run.workflow,
        status: state?.status ?? run.status,
        task: state?.taskSummary || run.task,
        step: state?.step ?? 0,
        maxSteps: run.budget.maxSteps,
        updatedAt,
        costUsd,
        tokens,
      });
      eventsForTimeline.push(...events.slice(-8));
    }

    setAgentRuns(displays.sort((a, b) => b.updatedAt - a.updatedAt));
    setTimeline(eventsForTimeline.sort((a, b) => parseTime(b.timestamp) - parseTime(a.timestamp)).slice(0, 30));
  }, []);

  const refreshQueue = useCallback(async () => {
    await loadQueue();
    const tasks = listTasks();
    setQueueEntries(tasks);
    setQueueStats(getQueueStats());
  }, []);

  const refreshAutonomous = useCallback(async () => {
    const status = await getAutonomousStatus().catch(() => null);
    setAutonomousRunning(Boolean(status?.running));
  }, []);

  useEffect(() => {
    void refreshRuns();
    void refreshQueue();
    void refreshAutonomous();

    const queueUnwatch = watchQueue(() => void refreshQueue());
    const interval = setInterval(() => {
      void refreshRuns();
      void refreshAutonomous();
    }, 2000);

    return () => {
      clearInterval(interval);
      queueUnwatch();
    };
  }, [refreshAutonomous, refreshQueue, refreshRuns]);

  useEffect(() => {
    if (selectedTaskIndex >= queueEntries.length) {
      setSelectedTaskIndex(Math.max(0, queueEntries.length - 1));
    }
  }, [queueEntries.length, selectedTaskIndex]);

  useEffect(() => {
    const task = queueEntries[selectedTaskIndex];
    if (!task) {
      setSelectedLog([]);
      return;
    }
    void readTaskLog(task.id)
      .then(log => setSelectedLog(log.split('\n').filter(Boolean).slice(-5)))
      .catch(() => setSelectedLog([]));
  }, [queueEntries, selectedTaskIndex]);

  useInput((input, key) => {
    if (input === '1') setActiveTab('queue');
    else if (input === '2') setActiveTab('agents');
    else if (input === '3') setActiveTab('timeline');
    else if (input === 's') {
      void (async () => {
        if (autonomousRunning) await stopAutonomousAgent();
        else await startAutonomousAgent();
        await refreshAutonomous();
      })();
    } else if (activeTab === 'queue' && key.upArrow) {
      setSelectedTaskIndex(i => Math.max(0, i - 1));
    } else if (activeTab === 'queue' && key.downArrow) {
      setSelectedTaskIndex(i => Math.min(queueEntries.length - 1, i + 1));
    }
  });

  const totals = useMemo(
    () =>
      agentRuns.reduce(
        (acc, run) => ({
          tokens: acc.tokens + run.tokens,
          costUsd: acc.costUsd + run.costUsd,
          running: acc.running + (run.status === 'running' || run.status === 'testing' ? 1 : 0),
          queued: acc.queued + (run.status === 'queued' || run.status === 'created' ? 1 : 0),
          completed: acc.completed + (run.status === 'completed' ? 1 : 0),
          failed: acc.failed + (run.status === 'failed' || run.status === 'cancelled' ? 1 : 0),
        }),
        { tokens: 0, costUsd: 0, running: 0, queued: 0, completed: 0, failed: 0 },
      ),
    [agentRuns],
  );

  const timelineEvents = useMemo(
    () =>
      [...timeline, ...buildTaskTimeline(queueEntries)].sort((a, b) => parseTime(b.timestamp) - parseTime(a.timestamp)),
    [queueEntries, timeline],
  );

  return (
    <Box flexDirection="column" paddingX={1} width={columns}>
      <Box>
        <Text bold inverse={activeTab === 'queue'} color={activeTab === 'queue' ? 'black' : 'white'}>
          {' '}
          1 Queue{' '}
        </Text>
        <Text bold inverse={activeTab === 'agents'} color={activeTab === 'agents' ? 'black' : 'white'}>
          {' '}
          2 Agents{' '}
        </Text>
        <Text bold inverse={activeTab === 'timeline'} color={activeTab === 'timeline' ? 'black' : 'white'}>
          {' '}
          3 Timeline{' '}
        </Text>
        <Text dimColor> s {autonomousRunning ? 'stop' : 'start'} daemon</Text>
      </Box>
      <Text dimColor>
        agents {totals.running} running | {totals.queued} queued | {totals.completed} done | {totals.failed} failed |{' '}
        {formatTokens(totals.tokens)} tokens | {formatCost(totals.costUsd)}
      </Text>
      <Divider />

      {activeTab === 'queue' && (
        <Box flexDirection="column">
          <Text bold>
            Daemon Queue{' '}
            <Text dimColor>
              {queueStats
                ? `${queueStats.pending} pending | ${queueStats.inProgress} running | ${queueStats.deadLetter} dead`
                : 'loading'}
            </Text>
          </Text>
          {queueEntries.length === 0 ? (
            <Text dimColor>No queued daemon tasks.</Text>
          ) : (
            queueEntries.slice(0, 15).map((task, index) => (
              <Box key={task.id}>
                <Text color={index === selectedTaskIndex ? 'suggestion' : undefined}>
                  {index === selectedTaskIndex ? '> ' : '  '}
                </Text>
                <QueueRow task={task} width={width} />
              </Box>
            ))
          )}
          {selectedLog.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              <Text bold>Selected task log</Text>
              {selectedLog.map(line => (
                <Text key={line} dimColor wrap="truncate-end">
                  {line}
                </Text>
              ))}
            </Box>
          )}
        </Box>
      )}

      {activeTab === 'agents' && (
        <Box flexDirection="column">
          <Text bold>Agent Runs ({agentRuns.length})</Text>
          {agentRuns.length === 0 ? (
            <Text dimColor>No agent runtime runs found.</Text>
          ) : (
            agentRuns.slice(0, 12).map(run => <AgentRow key={run.id} run={run} width={width} />)
          )}
        </Box>
      )}

      {activeTab === 'timeline' && (
        <Box flexDirection="column">
          <Text bold>Execution Timeline</Text>
          {timelineEvents.length === 0 ? (
            <Text dimColor>No task or agent events yet.</Text>
          ) : (
            timelineEvents.slice(0, 18).map(event => <TimelineRow key={event.id} event={event} width={width} />)
          )}
        </Box>
      )}
    </Box>
  );
}
