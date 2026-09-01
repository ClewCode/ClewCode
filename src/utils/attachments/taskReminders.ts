// Extracted from attachments.ts - task/todo reminder logic
// Large file refactor: split 3.5k file into focused modules

import { getSessionId } from '../../bootstrap/state.js';
import { type ToolUseContext, toolMatchesName } from '../../Tool.js';
import { TASK_CREATE_TOOL_NAME } from '../../tools/TaskCreateTool/constants.js';
import { TASK_UPDATE_TOOL_NAME } from '../../tools/TaskUpdateTool/constants.js';
import { TODO_WRITE_TOOL_NAME } from '../../tools/TodoWriteTool/constants.js';
import { isThinkingMessage } from '../messages.js';
import { getTaskListId, isTodoV2Enabled, listTasks } from '../tasks.js';

type Message = any;
type Attachment = any;

// NOTE: BRIEF_TOOL_NAME is feature-gated, keep dynamic check to avoid circular
const BRIEF_TOOL_NAME: string | null = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require('../../tools/BriefTool/prompt.js') as typeof import('../../tools/BriefTool/prompt.js'))
      .BRIEF_TOOL_NAME;
  } catch {
    return null;
  }
})();

export const TODO_REMINDER_CONFIG = {
  TURNS_SINCE_WRITE: 3,
  TURNS_BETWEEN_REMINDERS: 5,
} as const;

export function getTodoReminderTurnCounts(messages: Message[]): {
  turnsSinceLastTodoWrite: number;
  turnsSinceLastReminder: number;
} {
  let lastTodoWriteIndex = -1;
  let lastReminderIndex = -1;
  let assistantTurnsSinceWrite = 0;
  let assistantTurnsSinceReminder = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.type === 'assistant') {
      if (isThinkingMessage(message)) continue;
      if (
        lastTodoWriteIndex === -1 &&
        'message' in message &&
        Array.isArray((message as any).message?.content) &&
        (message as any).message.content.some((block: any) => block.type === 'tool_use' && block.name === 'TodoWrite')
      ) {
        lastTodoWriteIndex = i;
      }
      if (lastTodoWriteIndex === -1) assistantTurnsSinceWrite++;
      if (lastReminderIndex === -1) assistantTurnsSinceReminder++;
    } else if (
      lastReminderIndex === -1 &&
      (message as any)?.type === 'attachment' &&
      (message as any).attachment.type === 'todo_reminder'
    ) {
      lastReminderIndex = i;
    }
    if (lastTodoWriteIndex !== -1 && lastReminderIndex !== -1) break;
  }
  return {
    turnsSinceLastTodoWrite: assistantTurnsSinceWrite,
    turnsSinceLastReminder: assistantTurnsSinceReminder,
  };
}

export async function getTodoReminderAttachments(
  messages: Message[] | undefined,
  toolUseContext: ToolUseContext,
): Promise<Attachment[]> {
  if (!toolUseContext.options.tools.some(t => toolMatchesName(t, TODO_WRITE_TOOL_NAME))) {
    return [];
  }
  if (BRIEF_TOOL_NAME && toolUseContext.options.tools.some(t => toolMatchesName(t, BRIEF_TOOL_NAME))) {
    return [];
  }
  if (!messages || messages.length === 0) return [];
  const { turnsSinceLastTodoWrite, turnsSinceLastReminder } = getTodoReminderTurnCounts(messages);
  if (
    turnsSinceLastTodoWrite >= TODO_REMINDER_CONFIG.TURNS_SINCE_WRITE &&
    turnsSinceLastReminder >= TODO_REMINDER_CONFIG.TURNS_BETWEEN_REMINDERS
  ) {
    const todoKey = toolUseContext.agentId ?? getSessionId();
    const appState = toolUseContext.getAppState();
    const todos = (appState as any).todos[todoKey] ?? [];
    return [{ type: 'todo_reminder', content: todos, itemCount: todos.length } as unknown as Attachment];
  }
  return [];
}

export function getTaskReminderTurnCounts(messages: Message[]): {
  turnsSinceLastTaskManagement: number;
  turnsSinceLastReminder: number;
} {
  let lastTaskManagementIndex = -1;
  let lastReminderIndex = -1;
  let assistantTurnsSinceTaskManagement = 0;
  let assistantTurnsSinceReminder = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.type === 'assistant') {
      if (isThinkingMessage(message)) continue;
      if (
        lastTaskManagementIndex === -1 &&
        'message' in message &&
        Array.isArray((message as any).message?.content) &&
        (message as any).message.content.some(
          (block: any) =>
            block.type === 'tool_use' && (block.name === TASK_CREATE_TOOL_NAME || block.name === TASK_UPDATE_TOOL_NAME),
        )
      ) {
        lastTaskManagementIndex = i;
      }
      if (lastTaskManagementIndex === -1) assistantTurnsSinceTaskManagement++;
      if (lastReminderIndex === -1) assistantTurnsSinceReminder++;
    } else if (
      lastReminderIndex === -1 &&
      (message as any)?.type === 'attachment' &&
      (message as any).attachment.type === 'task_reminder'
    ) {
      lastReminderIndex = i;
    }
    if (lastTaskManagementIndex !== -1 && lastReminderIndex !== -1) break;
  }
  return {
    turnsSinceLastTaskManagement: assistantTurnsSinceTaskManagement,
    turnsSinceLastReminder: assistantTurnsSinceReminder,
  };
}

export async function getTaskReminderAttachments(
  messages: Message[] | undefined,
  toolUseContext: ToolUseContext,
): Promise<Attachment[]> {
  if (!isTodoV2Enabled()) return [];
  if (BRIEF_TOOL_NAME && toolUseContext.options.tools.some(t => toolMatchesName(t, BRIEF_TOOL_NAME))) {
    return [];
  }
  if (!toolUseContext.options.tools.some(t => toolMatchesName(t, TASK_UPDATE_TOOL_NAME))) {
    return [];
  }
  if (!messages || messages.length === 0) return [];
  const { turnsSinceLastTaskManagement, turnsSinceLastReminder } = getTaskReminderTurnCounts(messages);
  if (
    turnsSinceLastTaskManagement >= TODO_REMINDER_CONFIG.TURNS_SINCE_WRITE &&
    turnsSinceLastReminder >= TODO_REMINDER_CONFIG.TURNS_BETWEEN_REMINDERS
  ) {
    const tasks = await listTasks(getTaskListId());
    return [{ type: 'task_reminder', content: tasks, itemCount: tasks.length } as unknown as Attachment];
  }
  return [];
}
