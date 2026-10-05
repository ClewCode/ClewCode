import figures from 'figures';
import * as React from 'react';
import { AGENT_COLOR_TO_THEME_COLOR, type AgentColorName } from 'src/tools/AgentTool/agentColorManager.js';
import { hasExitedPlanModeInSession } from '../bootstrap/state.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { stringWidth } from '../ink/stringWidth.js';
import { Box, Text } from '../ink.js';
import { useAppState } from '../state/AppState.js';
import { isInProcessTeammateTask } from '../tasks/InProcessTeammateTask/types.js';
import { isAgentSwarmsEnabled } from '../utils/agentSwarmsEnabled.js';
import { count } from '../utils/array.js';
import { summarizeRecentActivities } from '../utils/collapseReadSearch.js';
import { formatDuration, truncateToWidth } from '../utils/format.js';
import { isTodoV2Enabled, type Task } from '../utils/tasks.js';
import type { Theme } from '../utils/theme.js';
import ThemedText from './design-system/ThemedText.js';
import { compareTaskIds, prioritizeTasks, RECENT_COMPLETED_TTL_MS } from './taskListUtils.js';
import { useTaskTiming } from './useTaskTiming.js';

type Props = {
  tasks: Task[];
  isStandalone?: boolean;
};

export type TaskDisplayGroup = {
  title: string;
  order: number;
  tasks: Task[];
};

const DEFAULT_GROUP_TITLE = 'Execution';

const byIdAsc = compareTaskIds;

function readGroupTitle(task: Task): string {
  const value = task.metadata?.group;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : DEFAULT_GROUP_TITLE;
}

function readGroupOrder(task: Task): number | undefined {
  const value = task.metadata?.groupOrder;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function buildTaskDisplayGroups(tasks: Task[]): TaskDisplayGroup[] {
  const groups = new Map<string, TaskDisplayGroup>();
  for (const task of tasks) {
    const title = readGroupTitle(task);
    const explicitOrder = readGroupOrder(task);
    const existing = groups.get(title);
    if (existing) {
      if (explicitOrder !== undefined) existing.order = Math.min(existing.order, explicitOrder);
      existing.tasks.push(task);
      continue;
    }
    groups.set(title, { title, order: explicitOrder ?? Number.POSITIVE_INFINITY, tasks: [task] });
  }
  return [...groups.values()]
    .map(group => ({ ...group, tasks: [...group.tasks].sort(byIdAsc) }))
    .sort((a, b) => a.order - b.order || byIdAsc(a.tasks[0]!, b.tasks[0]!) || a.title.localeCompare(b.title));
}

/** Indent for the group header row, in spaces. */
const GROUP_INDENT = '  ';
/** Indent for task rows nested under a group header, in spaces. */
const TASK_INDENT = '    ';

export function TaskListV2({ tasks, isStandalone = false }: Props): React.ReactNode {
  const teamContext = useAppState(s => s.teamContext);
  const appStateTasks = useAppState(s => s.tasks);
  const { rows, columns } = useTerminalSize();
  const { now, completionTimestampsRef, startTimestampsRef } = useTaskTiming(tasks);
  const maxDisplay = rows <= 10 ? 0 : Math.min(10, Math.max(3, rows - 14));

  if (!isTodoV2Enabled()) {
    return null;
  }

  if (tasks.length === 0) {
    return null;
  }

  // Ultra-compact mode for very small terminals
  if (rows <= 12 && !isStandalone) {
    const completedCount = count(tasks, t => t.status === 'completed');
    const inProgressCount = count(tasks, t => t.status === 'in_progress');
    const pendingCount = tasks.length - completedCount - inProgressCount;
    const parts: string[] = [];
    if (completedCount > 0) parts.push(`${completedCount}✓`);
    if (inProgressCount > 0) parts.push(`${inProgressCount}●`);
    if (pendingCount > 0) parts.push(`${pendingCount}○`);
    return (
      <Box>
        <Text dimColor>
          {tasks.length} tasks: {parts.join(' ')}
        </Text>
      </Box>
    );
  }

  // Build a map of teammate name -> theme color
  const teammateColors: Record<string, keyof Theme> = {};
  if (isAgentSwarmsEnabled() && teamContext?.teammates) {
    for (const teammate of Object.values(teamContext.teammates)) {
      if (teammate.color) {
        const themeColor = AGENT_COLOR_TO_THEME_COLOR[teammate.color as AgentColorName];
        if (themeColor) {
          teammateColors[teammate.name] = themeColor;
        }
      }
    }
  }

  // Build a map of teammate name -> current activity description
  // Map both agentName ("researcher") and agentId ("researcher@team") so
  // task owners match regardless of which format the model used.
  // Rolls up consecutive search/read tool uses into a compact summary.
  // Also track which teammates are still running (not shut down).
  const teammateActivity: Record<string, string> = {};
  const activeTeammates = new Set<string>();
  if (isAgentSwarmsEnabled()) {
    for (const bgTask of Object.values(appStateTasks)) {
      if (isInProcessTeammateTask(bgTask) && bgTask.status === 'running') {
        activeTeammates.add(bgTask.identity.agentName);
        activeTeammates.add(bgTask.identity.agentId);
        const activities = bgTask.progress?.recentActivities;
        const desc =
          (activities && summarizeRecentActivities(activities)) ?? bgTask.progress?.lastActivity?.activityDescription;
        if (desc) {
          teammateActivity[bgTask.identity.agentName] = desc;
          teammateActivity[bgTask.identity.agentId] = desc;
        }
      }
    }
  }

  // Get task counts for display
  const completedCount = count(tasks, t => t.status === 'completed');
  const pendingCount = count(tasks, t => t.status === 'pending');
  const inProgressCount = tasks.length - completedCount - pendingCount;
  // Unresolved tasks (open or in_progress) block dependent tasks
  const unresolvedTaskIds = new Set(tasks.filter(t => t.status !== 'completed').map(t => t.id));

  // Check if we need to truncate
  const needsTruncation = tasks.length > maxDisplay;

  const { visibleTasks, hiddenTasks } = prioritizeTasks(
    tasks,
    completionTimestampsRef.current,
    now,
    needsTruncation ? maxDisplay : tasks.length,
  );

  let hiddenSummary = '';
  if (hiddenTasks.length > 0) {
    const parts: string[] = [];
    const hiddenPending = count(hiddenTasks, t => t.status === 'pending');
    const hiddenInProgress = count(hiddenTasks, t => t.status === 'in_progress');
    const hiddenCompleted = count(hiddenTasks, t => t.status === 'completed');
    if (hiddenInProgress > 0) {
      parts.push(`${hiddenInProgress} in progress`);
    }
    if (hiddenPending > 0) {
      parts.push(`${hiddenPending} pending`);
    }
    if (hiddenCompleted > 0) {
      parts.push(`${hiddenCompleted} completed`);
    }
    hiddenSummary = `+${parts.join(', ')}`;
  }

  const groups = buildTaskDisplayGroups(visibleTasks);
  const singleGroup = groups.length === 1;
  const content = (
    <>
      {groups.map(group => {
        const groupCompleted = count(group.tasks, task => task.status === 'completed');
        const groupActive = group.tasks.some(task => task.status === 'in_progress');
        const groupDone = groupCompleted === group.tasks.length;

        return (
          <Box key={group.title} flexDirection="column">
            {/* A lone group is named on the TODO title line (see TitleRow), so it
                needs no header of its own. Several groups each get one. */}
            {!singleGroup && (
              <Box>
                <Text dimColor>{GROUP_INDENT}</Text>
                <Text color={groupActive ? 'permission' : undefined} dimColor={groupDone} bold={groupActive}>
                  {figures.pointerSmall} {group.title}
                </Text>
                <Text dimColor>
                  {'  '}
                  {groupCompleted}/{group.tasks.length}
                </Text>
              </Box>
            )}
            {group.tasks.map(task => (
              <TaskItem
                key={task.id}
                task={task}
                prefix={singleGroup ? GROUP_INDENT : TASK_INDENT}
                ownerColor={task.owner ? teammateColors[task.owner] : undefined}
                openBlockers={task.blockedBy.filter(id => unresolvedTaskIds.has(id))}
                activity={task.owner ? teammateActivity[task.owner] : undefined}
                ownerActive={task.owner ? activeTeammates.has(task.owner) : false}
                columns={columns}
                elapsedMs={
                  task.status === 'in_progress' && startTimestampsRef.current.has(task.id)
                    ? Date.now() - startTimestampsRef.current.get(task.id)!
                    : undefined
                }
              />
            ))}
          </Box>
        );
      })}
      {maxDisplay > 0 && hiddenSummary && (
        <Box>
          <Text dimColor>{singleGroup ? GROUP_INDENT : TASK_INDENT}</Text>
          <Text dimColor>… {hiddenSummary}</Text>
        </Box>
      )}
    </>
  );

  const isPlanTodo = tasks.some(t => t.metadata?.fromPlan === true) || hasExitedPlanModeInSession();
  const todoTitle = isPlanTodo ? 'PLANS TODO' : 'TODO';

  // A lone group is named on the TODO title line (see TitleRow). Several groups
  // each get their own header with a per-group tally; the title keeps an
  // overall count for context.
  const onlyGroup = singleGroup ? groups[0] : undefined;
  const titleSuffix = `${completedCount}/${tasks.length}${inProgressCount > 0 ? ` · ${inProgressCount} running` : ''}`;

  if (isStandalone) {
    return (
      <Box flexDirection="column" marginTop={1} marginLeft={2}>
        <TitleRow title={todoTitle} groupTitle={onlyGroup?.title} suffix={titleSuffix} standalone />
        {content}
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <TitleRow title={todoTitle} groupTitle={onlyGroup?.title} suffix={titleSuffix} />
      {content}
    </Box>
  );
}

function TitleRow({
  title,
  groupTitle,
  suffix,
  standalone = false,
}: {
  title: string;
  groupTitle?: string;
  suffix: string;
  standalone?: boolean;
}): React.ReactNode {
  return (
    <Box>
      <Text color={standalone ? 'permission' : 'success'} bold>
        {title}
      </Text>
      {groupTitle && (
        <Text dimColor>
          {'  '}
          {figures.pointerSmall} {groupTitle}
        </Text>
      )}
      <Text dimColor>
        {'  '}
        {suffix}
      </Text>
    </Box>
  );
}

type TaskItemProps = {
  task: Task;
  prefix: string;
  ownerColor?: keyof Theme;
  openBlockers: string[];
  activity?: string;
  ownerActive: boolean;
  columns: number;
  elapsedMs?: number;
};

function getTaskIcon(
  status: Task['status'],
  isBlocked: boolean,
): {
  icon: string;
  color: keyof Theme | undefined;
} {
  if (isBlocked) {
    return { icon: '⊘', color: 'warning' };
  }
  switch (status) {
    case 'completed':
      return { icon: '✓', color: 'success' };
    case 'in_progress':
      return { icon: '◐', color: 'permission' };
    case 'pending':
      return { icon: '○', color: undefined };
  }
}

function TaskItem({
  task,
  prefix,
  ownerColor,
  openBlockers,
  activity,
  ownerActive,
  columns,
  elapsedMs,
}: TaskItemProps): React.ReactNode {
  const isCompleted = task.status === 'completed';
  const isInProgress = task.status === 'in_progress';
  const isBlocked = openBlockers.length > 0;

  const { icon, color } = getTaskIcon(task.status, isBlocked);

  const showActivity = isInProgress && !isBlocked && activity;

  // Responsive layout: hide owner on narrow screens (<60 cols)
  // Truncate subject based on available space
  const showOwner = columns >= 60 && task.owner && ownerActive;
  const ownerWidth = showOwner ? stringWidth(` (@${task.owner})`) : 0;
  const elapsedStr = isInProgress && elapsedMs !== undefined ? formatDuration(elapsedMs) : undefined;
  const elapsedWidth = elapsedStr ? stringWidth(` (${elapsedStr})`) : 0;
  // Account for: icon(2) + indentation(~8 when nested under spinner) + owner + elapsed + safety
  // Use columns - 15 as a conservative estimate for nested layouts
  const maxSubjectWidth = Math.max(15, columns - 15 - stringWidth(prefix) - ownerWidth - elapsedWidth);
  const displaySubject = truncateToWidth(task.subject, maxSubjectWidth);

  // Truncate activity for narrow screens
  const maxActivityWidth = Math.max(15, columns - 15);
  const displayActivity = activity ? truncateToWidth(activity, maxActivityWidth) : undefined;

  return (
    <Box flexDirection="column">
      <Box>
        <Text dimColor>{prefix}</Text>
        <Text color={color}>{icon}</Text>
        <Text
          bold={isInProgress}
          dimColor={isCompleted || (!isInProgress && !isBlocked)}
          strikethrough={isCompleted}
          color={isBlocked ? 'warning' : isInProgress ? 'permission' : undefined}
        >
          {` ${displaySubject}`}
        </Text>
        {elapsedStr && <Text dimColor> ({elapsedStr})</Text>}
        {showOwner && (
          <Text dimColor>
            {' ('}
            {ownerColor ? <ThemedText color={ownerColor}>@{task.owner}</ThemedText> : `@${task.owner}`}
            {')'}
          </Text>
        )}
        {isBlocked && (
          <Text dimColor>
            {' '}
            {figures.pointerSmall} blocked by{' '}
            {[...openBlockers]
              .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
              .map(id => `#${id}`)
              .join(', ')}
          </Text>
        )}
      </Box>
      {showActivity && displayActivity && (
        <Box>
          <Text dimColor>
            {' '.repeat(stringWidth(prefix) + 2)}
            {displayActivity}
            {figures.ellipsis}
          </Text>
        </Box>
      )}
    </Box>
  );
}
