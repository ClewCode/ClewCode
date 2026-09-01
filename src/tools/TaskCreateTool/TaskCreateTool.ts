import { z } from 'zod/v4';
import { buildTool, type ToolDef } from '../../Tool.js';
import { executeTaskCreatedHooks, getTaskCreatedHookMessage } from '../../utils/hooks.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { createTask, deleteTask, getTaskListId, isTodoV2Enabled, listTasks, updateTask } from '../../utils/tasks.js';
import { getAgentName, getTeamName } from '../../utils/teammate.js';
import { TASK_CREATE_TOOL_NAME } from './constants.js';
import { DESCRIPTION, getPrompt } from './prompt.js';

const inputSchema = lazySchema(() =>
  z.strictObject({
    subject: z.string().describe('A brief title for the task'),
    description: z.string().optional().describe('What needs to be done; defaults to the subject'),
    action: z.literal('complete').optional().describe('Compatibility shortcut: complete an existing task by subject'),
    activeForm: z
      .string()
      .optional()
      .describe('Present continuous form shown in spinner when in_progress (e.g., "Running tests")'),
    metadata: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('Task metadata. Use group and groupOrder to organize related tasks into ordered TODO sections'),
  }),
);
type InputSchema = ReturnType<typeof inputSchema>;

const outputSchema = lazySchema(() =>
  z.object({
    task: z.object({
      id: z.string(),
      subject: z.string(),
      completed: z.boolean().optional(),
    }),
  }),
);
type OutputSchema = ReturnType<typeof outputSchema>;

export type Output = z.infer<OutputSchema>;

export const TaskCreateTool = buildTool({
  name: TASK_CREATE_TOOL_NAME,
  searchHint: 'create a task in the task list',
  maxResultSizeChars: 100_000,
  async description() {
    return DESCRIPTION;
  },
  async prompt() {
    return getPrompt();
  },
  get inputSchema(): InputSchema {
    return inputSchema();
  },
  get outputSchema(): OutputSchema {
    return outputSchema();
  },
  userFacingName() {
    return 'TaskCreate';
  },
  shouldDefer: true,
  isEnabled() {
    return isTodoV2Enabled();
  },
  isConcurrencySafe() {
    return true;
  },
  toAutoClassifierInput(input) {
    return input.subject;
  },
  renderToolUseMessage() {
    return null;
  },
  async call({ subject, description, action, activeForm, metadata }, context) {
    if (action === 'complete') {
      const existing = (await listTasks(getTaskListId())).find(task => task.subject === subject);
      if (existing) {
        await updateTask(getTaskListId(), existing.id, { status: 'completed' });
        return { data: { task: { id: existing.id, subject: existing.subject, completed: true } } };
      }
      throw new Error(`Cannot complete task by subject because no matching task exists: ${subject}`);
    }

    const taskDescription = description?.trim() || subject;
    const taskId = await createTask(getTaskListId(), {
      subject,
      description: taskDescription,
      activeForm,
      status: 'pending',
      owner: undefined,
      blocks: [],
      blockedBy: [],
      metadata,
    });

    const blockingErrors: string[] = [];
    const generator = executeTaskCreatedHooks(
      taskId,
      subject,
      taskDescription,
      getAgentName(),
      getTeamName(),
      undefined,
      context?.abortController?.signal,
      undefined,
      context,
    );
    for await (const result of generator) {
      if (result.blockingError) {
        blockingErrors.push(getTaskCreatedHookMessage(result.blockingError));
      }
    }

    if (blockingErrors.length > 0) {
      await deleteTask(getTaskListId(), taskId);
      throw new Error(blockingErrors.join('\n'));
    }

    // Auto-expand task list when creating tasks
    context.setAppState(prev => {
      if (prev.expandedView === 'tasks') return prev;
      return { ...prev, expandedView: 'tasks' as const };
    });

    return {
      data: {
        task: {
          id: taskId,
          subject,
        },
      },
    };
  },
  mapToolResultToToolResultBlockParam(content, toolUseID) {
    const { task } = content as Output;
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: task.completed
        ? `Task #${task.id} completed successfully: ${task.subject}`
        : `Task #${task.id} created successfully: ${task.subject}`,
    };
  },
} satisfies ToolDef<InputSchema, Output>);
