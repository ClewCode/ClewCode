import capitalize from 'lodash-es/capitalize.js';
import type { SettingSource } from 'src/utils/settings/constants.js';
import { getSettingSourceName } from 'src/utils/settings/constants.js';
import { isLocalAgentTask } from '../../tasks/LocalAgentTask/LocalAgentTask.js';

export function getAgentSourceDisplayName(source: SettingSource | 'all' | 'built-in' | 'plugin'): string {
  if (source === 'all') {
    return 'Agents';
  }
  if (source === 'built-in') {
    return 'Built-in agents';
  }
  if (source === 'plugin') {
    return 'Plugin agents';
  }
  return capitalize(getSettingSourceName(source));
}

/**
 * Check if a task is waiting for user input (AskUserQuestionTool).
 */
export function isWaitingForInput(task: {
  status: string;
  progress?: { lastActivity?: { toolName?: string } } | null;
}): boolean {
  try {
    if (isLocalAgentTask(task as any)) {
      return task.status === 'running' && (task as any).progress?.lastActivity?.toolName === 'AskUserQuestionTool';
    }
  } catch {
    /* ignore */
  }
  return false;
}
