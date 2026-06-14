// ponytail: module-level singleton — set by /mode, read by footer + tool permission gate
import { getNextPermissionMode } from './permissions/getNextPermissionMode.js';
import type { ToolPermissionContext } from '../Tool.js';
import type { PermissionMode } from './permissions/PermissionMode.js';

// Types (moved from permissions.ts due to Bun transpiler bug)
export const EXECUTION_MODES = ['safe', 'yolo', 'afk', 'review-only', 'browser-safe'] as const;
export type ExecutionMode = (typeof EXECUTION_MODES)[number];

export const EXECUTION_MODE_LABELS: Record<ExecutionMode, string> = {
  safe: 'Safe',
  yolo: 'YOLO',
  afk: 'AFK',
  'review-only': 'Review',
  'browser-safe': 'Browser',
};

export const EXECUTION_MODE_TO_PERMISSION: Record<ExecutionMode, PermissionMode> = {
  safe: 'ask',
  yolo: 'acceptEdits',
  afk: 'auto',
  'review-only': 'default',
  'browser-safe': 'acceptEdits',
};

let _mode: ExecutionMode = 'safe';

export function getExecutionMode(): ExecutionMode {
  return _mode;
}

export function setExecutionMode(mode: ExecutionMode): void {
  _mode = mode;
}

export function getExecutionModeLabel(): string {
  return EXECUTION_MODE_LABELS[_mode];
}

/** Cycle to next execution mode (for Shift+Tab override) */
export function cycleExecutionMode(ctx: ToolPermissionContext): { label: string; nextPerm: PermissionMode } {
  const idx = (EXECUTION_MODES as readonly string[]).indexOf(_mode);
  const next = EXECUTION_MODES[(idx + 1) % EXECUTION_MODES.length] as ExecutionMode;
  _mode = next;

  const { nextMode } = { nextMode: getNextPermissionMode(ctx) };
  return { label: EXECUTION_MODE_LABELS[next], nextPerm: nextMode };
}

/** Check if a tool is blocked in current execution mode */
export function isToolBlockedInMode(toolName: string): string | null {
  if (_mode === 'review-only') {
    const writeTools = ['Edit', 'Write', 'FileWriteTool', 'FileEditTool', 'NotebookEdit', 'Bash'];
    if (writeTools.includes(toolName)) return `Blocked in review-only mode. Use /mode to switch.`;
  }
  return null;
}
