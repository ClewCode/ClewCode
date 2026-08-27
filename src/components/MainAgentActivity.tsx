import * as React from 'react';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { Box, Text } from '../ink.js';
import { useAppState } from '../state/AppState.js';
import { isLocalAgentTask, type LocalAgentTaskState } from '../tasks/LocalAgentTask/LocalAgentTask.js';

const CLOCK_INTERVAL_MS = 1000;
const ANIMATION_INTERVAL_MS = 220;
const MAX_VISIBLE_ROWS = 6;
type AgentActivitySection = 'running' | 'idle' | 'inactive';
const SECTION_ORDER: readonly AgentActivitySection[] = ['idle', 'running', 'inactive'];
const WORKING_FRAMES = ['✻', '✽', '✢', '·'] as const;
const WAITING_FRAMES = ['◌', '○'] as const;

export type MainAgentActivityRow = {
  identity: string;
  section: AgentActivitySection;
  title: string;
  detail: string;
  timestamp: number;
};

export type MainAgentActivityModel = {
  counts: Record<AgentActivitySection, number>;
  rows: MainAgentActivityRow[];
};

function classifyTask(task: LocalAgentTaskState): AgentActivitySection {
  const running = task.status === 'running' || task.status === 'pending';
  if (!running) return 'inactive';
  return task.progress?.lastActivity?.toolName === 'AskUserQuestionTool' ? 'idle' : 'running';
}

function taskDetail(task: LocalAgentTaskState, section: AgentActivitySection): string {
  const activity = task.progress?.lastActivity?.activityDescription?.trim();
  if (activity) return activity;
  const summary = task.progress?.summary?.trim();
  if (summary) return summary;
  if (section === 'idle') return 'waiting for your reply';
  if (section === 'running') return 'working';
  return task.status === 'failed' ? 'failed' : task.status === 'killed' ? 'stopped' : 'completed';
}

/** Build the compact main-page roster from this session's subagents only. */
export function buildMainAgentActivityModel(
  tasks: readonly LocalAgentTaskState[],
  maxRows = MAX_VISIBLE_ROWS,
): MainAgentActivityModel {
  const counts: Record<AgentActivitySection, number> = { running: 0, idle: 0, inactive: 0 };
  const bySection: Record<AgentActivitySection, MainAgentActivityRow[]> = {
    running: [],
    idle: [],
    inactive: [],
  };

  for (const task of tasks) {
    const section = classifyTask(task);
    counts[section]++;
    bySection[section].push({
      identity: task.id,
      section,
      title: task.description.trim() || task.agentType,
      detail: taskDetail(task, section),
      timestamp: task.endTime ?? task.startTime,
    });
  }

  for (const section of SECTION_ORDER) {
    bySection[section].sort((a, b) => b.timestamp - a.timestamp || a.title.localeCompare(b.title));
  }

  const rows: MainAgentActivityRow[] = [];
  for (let offset = 0; rows.length < maxRows; offset++) {
    let added = false;
    for (const section of SECTION_ORDER) {
      const row = bySection[section][offset];
      if (!row) continue;
      rows.push(row);
      added = true;
      if (rows.length >= maxRows) break;
    }
    if (!added) break;
  }

  return { counts, rows };
}

function truncate(value: string, width: number): string {
  if (width <= 0) return '';
  return value.length <= width ? value : `${value.slice(0, Math.max(0, width - 1))}…`;
}

function formatAge(timestamp: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function sectionLabel(section: AgentActivitySection): string {
  if (section === 'idle') return 'Needs input';
  if (section === 'running') return 'Working';
  return 'Completed';
}

function statusIcon(section: AgentActivitySection, frame: number): string {
  if (section === 'running') return WORKING_FRAMES[frame % WORKING_FRAMES.length];
  if (section === 'idle') return WAITING_FRAMES[frame % WAITING_FRAMES.length];
  return '·';
}

function statusColor(section: AgentActivitySection): 'success' | 'warning' | undefined {
  if (section === 'running') return 'success';
  if (section === 'idle') return 'warning';
  return undefined;
}

export const MainAgentActivity = React.memo(function MainAgentActivity(): React.ReactNode {
  const { columns } = useTerminalSize();
  const tasks = useAppState(state => state.tasks);
  const localAgents = React.useMemo(() => Object.values(tasks).filter(isLocalAgentTask), [tasks]);
  const model = React.useMemo(() => buildMainAgentActivityModel(localAgents), [localAgents]);
  const [now, setNow] = React.useState(Date.now());
  const [frame, setFrame] = React.useState(0);

  React.useEffect(() => {
    if (localAgents.length === 0) return;
    const clock = setInterval(() => setNow(Date.now()), CLOCK_INTERVAL_MS);
    return () => clearInterval(clock);
  }, [localAgents.length]);

  React.useEffect(() => {
    if (model.counts.running === 0) return;
    const animation = setInterval(() => setFrame(value => value + 1), ANIMATION_INTERVAL_MS);
    return () => clearInterval(animation);
  }, [model.counts.running]);

  if (localAgents.length === 0) return null;

  const titleWidth = Math.max(18, Math.min(34, Math.floor(columns * 0.28)));
  const detailWidth = Math.max(12, columns - titleWidth - 16);

  return (
    <Box flexDirection="column" marginTop={1} marginLeft={1} width="100%">
      {SECTION_ORDER.map(section => {
        const rows = model.rows.filter(row => row.section === section);
        if (rows.length === 0) return null;
        return (
          <Box key={section} flexDirection="column" marginTop={1}>
            <Text color={statusColor(section)}>{sectionLabel(section)}</Text>
            {rows.map(row => (
              <Box key={row.identity} width="100%">
                <Text color={statusColor(section)}>{statusIcon(section, frame)} </Text>
                <Text bold>{truncate(row.title, titleWidth).padEnd(titleWidth)} </Text>
                <Text dimColor>{truncate(row.detail, detailWidth)}</Text>
                <Box flexGrow={1} />
                <Text dimColor>{formatAge(row.timestamp, now)}</Text>
              </Box>
            ))}
          </Box>
        );
      })}
    </Box>
  );
});
