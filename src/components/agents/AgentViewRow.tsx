/**
 * AgentViewRow — Single session row in the agent view dashboard.
 * Extracted from AgentViewDashboard for maintainability.
 */

import figures from 'figures';
import * as React from 'react';
import { Box, Text } from '../../ink.js';
import type { LocalAgentTaskState } from '../../tasks/LocalAgentTask/LocalAgentTask.js';
import { isWaitingForInput as checkWaitingForInput } from './utils.js';

export type TaskCategory = 'needs-input' | 'working' | 'completed' | 'failed' | 'stopped';

export function isWaitingForInput(task: {
  status: string;
  progress?: { lastActivity?: { toolName?: string } } | null;
}): boolean {
  return checkWaitingForInput(task as any);
}

export function getTaskCategory(task: {
  status: string;
  progress?: { lastActivity?: { toolName?: string } } | null;
}): TaskCategory {
  if (task.status === 'failed') return 'failed';
  if (task.status === 'killed') return 'stopped';
  if (isWaitingForInput(task)) return 'needs-input';
  if (task.status === 'running' || task.status === 'pending') return 'working';
  return 'completed';
}

export function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/**
 * Shape-based icons matching official Clew Code agent view:
 * ✻ (alive process, active), ✽ (alive process, animated),
 * ∙ (process exited), ✢ (loop/sleep session)
 */
const SHAPE_ICONS = {
  alive: figures.circleDotted, // ✽ — animated while working
  exited: figures.bullet, // ∙ — process has exited
  loop: figures.lozenge, // ◊ — loop/sleep session
} as const;

const STATE_COLORS: Record<TaskCategory, string> = {
  'needs-input': 'yellow',
  working: 'blue',
  completed: 'green',
  failed: 'red',
  stopped: 'grey',
} as const;

const STATE_ICONS: Record<TaskCategory, string> = {
  'needs-input': '?',
  working: figures.circleDotted,
  completed: figures.tick,
  failed: figures.cross,
  stopped: figures.circle,
} as const;

/**
 * PR status colors matching official Clew Code spec:
 * - Yellow: waiting on checks/review, or checks failed
 * - Green: checks passed, no review blocking
 * - Purple: merged
 * - Grey: draft or closed
 */
export type PRStatus = 'pending_checks' | 'checks_failed' | 'checks_passed' | 'merged' | 'draft' | 'closed';

export type PRDisplayInfo = {
  number: number;
  title?: string;
  status: PRStatus;
  url?: string;
};

const PR_STATUS_ICONS: Record<PRStatus, { char: string; color: string }> = {
  pending_checks: { char: '●', color: 'yellow' },
  checks_failed: { char: '●', color: 'yellow' },
  checks_passed: { char: '●', color: 'green' },
  merged: { char: '●', color: 'magenta' },
  draft: { char: '●', color: 'grey' },
  closed: { char: '●', color: 'grey' },
};

const PR_STATUS_LABELS: Record<PRStatus, string> = {
  pending_checks: 'Pending',
  checks_failed: 'Failed',
  checks_passed: 'Passing',
  merged: 'Merged',
  draft: 'Draft',
  closed: 'Closed',
};

export function getPRStatusIcon(status: PRStatus): { char: string; color: string } {
  return PR_STATUS_ICONS[status] ?? { char: '●', color: 'grey' };
}

export function getPRStatusLabel(status: PRStatus): string {
  return PR_STATUS_LABELS[status] ?? 'Unknown';
}

export function getStatusIcon(task: {
  status: string;
  progress?: { lastActivity?: { toolName?: string } } | null;
  processRunning?: boolean;
  isLoopSession?: boolean;
}): { icon: string; color: string; isAnimated: boolean } {
  const cat = getTaskCategory(task);
  const baseColor = STATE_COLORS[cat];

  // Shape distinction
  if (task.isLoopSession) {
    return { icon: SHAPE_ICONS.loop, color: baseColor, isAnimated: false };
  }
  if (task.processRunning === false) {
    // Process has exited but task state is preserved
    return { icon: SHAPE_ICONS.exited, color: baseColor, isAnimated: false };
  }
  if (task.status === 'running' && task.processRunning !== false) {
    // Animated spinner for actively working sessions
    return { icon: figures.circleDotted, color: baseColor, isAnimated: true };
  }
  // Default: use state-specific icon
  return { icon: STATE_ICONS[cat] ?? figures.circle, color: baseColor, isAnimated: false };
}

export function getActivityPreview(task: LocalAgentTaskState): string {
  // Prefer AI-generated row summary
  if ((task as any).rowSummary) return (task as any).rowSummary;

  const last = task.progress?.lastActivity;
  if (last?.activityDescription) return last.activityDescription;
  if (last?.toolName) return `Running ${last.toolName}`;
  if (task.status === 'completed') return 'Task completed';
  if (task.status === 'failed') return task.error ?? 'Failed';
  if (task.status === 'killed') return 'Stopped';
  return task.prompt?.slice(0, 60) ?? 'Working...';
}

type Props = {
  task: LocalAgentTaskState;
  index: number;
  isSelected: boolean;
  prCount?: number;
  prStatus?: PRStatus | null;
  prUrl?: string | null;
  prDisplayInfo?: PRDisplayInfo | null;
  width?: number;
};

function truncateToWidth(text: string, width: number): string {
  if (width <= 0) return '';
  if (text.length <= width) return text.padEnd(width);
  if (width <= 3) return text.slice(0, width);
  return `${text.slice(0, width - 3)}...`;
}

function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 100) / 10}K`;
  return String(tokens);
}

function formatRowLine({
  task,
  previewText,
  width,
}: {
  task: LocalAgentTaskState;
  previewText: string;
  width: number;
}): string {
  const nameWidth = width >= 96 ? 22 : width >= 72 ? 18 : 14;
  const timeWidth = 5;
  const gapWidth = 3;
  const tokenCount = task.progress?.tokenCount ?? 0;
  const tokenText = width >= 80 && tokenCount > 0 ? `${formatTokenCount(tokenCount)} tok` : '';
  const tokenWidth = tokenText ? Math.max(8, tokenText.length) : 0;
  // name + gap + preview + optional token + gap + time = width
  const previewWidth = Math.max(8, width - nameWidth - gapWidth - timeWidth - (tokenWidth ? tokenWidth + 1 : 0));
  const name = (task as any).customName ?? task.agentType ?? 'Agent';
  const time = task.startTime ? formatTimeAgo(task.startTime) : '';
  const padName = name.padEnd(nameWidth).slice(0, nameWidth);
  const padPreview = previewText.padEnd(previewWidth).slice(0, previewWidth);
  const tokenSegment = tokenText ? ` ${tokenText.padStart(tokenWidth)}` : '';
  return `${padName} ${padPreview}${tokenSegment} ${time.padStart(timeWidth)}`;
}

export function AgentViewRow({ task, isSelected, prStatus, prDisplayInfo, width = 96 }: Props) {
  const statusStyle = getStatusIcon(task);
  const previewText = getActivityPreview(task);

  // PR status dot
  const prDot = prStatus ? getPRStatusIcon(prStatus) : null;
  const rowLine = formatRowLine({ task, previewText, width: Math.max(40, width - 3) });
  const backgroundColor = isSelected ? '#3a3a3a' : undefined;
  const textColor = isSelected ? 'text' : undefined;

  // Width-aware PR column rendering
  const prColumn = React.useMemo(() => {
    if (!prDisplayInfo && !prDot) return null;
    if (width < 80) {
      // Narrow: just the status dot
      return prDot ? { text: prDot.char, color: prDot.color as any } : null;
    }
    if (width >= 120) {
      // Wide: #number + title + status label + dot
      const prNum = `#${prDisplayInfo?.number ?? ''}`;
      const prTitle = prDisplayInfo?.title ? truncateToWidth(prDisplayInfo.title, 24) : '';
      const label = prDisplayInfo?.status ? getPRStatusLabel(prDisplayInfo.status) : '';
      const parts = [prNum, prTitle, label, prDot?.char].filter(Boolean).join(' ');
      return { text: parts, color: prDot?.color as any };
    }
    // Medium (80-119): #number + dot
    const prNum = `#${prDisplayInfo?.number ?? ''}`;
    return { text: `${prNum} ${prDot?.char}`, color: prDot?.color as any };
  }, [prDisplayInfo, prDot, width]);

  return (
    <Box key={task.id} flexDirection="row" height={1} width={width} paddingLeft={2}>
      <Text color={isSelected ? textColor : (statusStyle.color as any)} backgroundColor={backgroundColor}>
        {statusStyle.icon}
      </Text>
      <Text backgroundColor={backgroundColor}> </Text>
      <Text
        bold={isSelected}
        dimColor={!isSelected}
        color={textColor as any}
        backgroundColor={backgroundColor}
        wrap="truncate"
      >
        {rowLine}
      </Text>
      {prColumn && (
        <Text dimColor color={prColumn.color} backgroundColor={backgroundColor}>
          {' '}
          {prColumn.text}
        </Text>
      )}
    </Box>
  );
}

export function AgentViewGroupHeader({
  label,
  count,
  color,
  isCollapsed,
  isSelected,
}: {
  label: string;
  count: number;
  color: string;
  isCollapsed: boolean;
  onToggle: () => void;
  isSelected: boolean;
}) {
  const arrow = isCollapsed ? figures.arrowRight : figures.arrowDown;
  return (
    <Box flexDirection="row" height={1} marginTop={1}>
      <Text dimColor>{arrow} </Text>
      <Text color={isSelected ? 'text' : (color as any)} bold>
        {label}
      </Text>
      <Text dimColor> · {count}</Text>
    </Box>
  );
}
