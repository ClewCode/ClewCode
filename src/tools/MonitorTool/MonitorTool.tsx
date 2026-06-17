import { z } from 'zod/v4';
import { Box, Text } from '../../ink.js';
import type { Tool } from '../../Tool.js';
import { buildTool } from '../../Tool.js';
import { isLocalShellTask } from '../../tasks/LocalShellTask/guards.js';
import type { TaskState } from '../../tasks/types.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { sleep } from '../../utils/sleep.js';
import { getTaskOutput } from '../../utils/task/diskOutput.js';
import { formatTaskOutput } from '../../utils/task/outputFormatting.js';
import { MONITOR_TOOL_NAME } from './constants.js';

const inputSchema = lazySchema(() =>
  z.strictObject({
    task_id: z.string().describe('The task ID to monitor'),
    stream: z.boolean().default(true).describe('Whether to stream events in real-time'),
    timeout: z.number().min(0).max(600000).default(60000).describe('Max monitoring time in ms'),
  }),
);

type InputSchema = ReturnType<typeof inputSchema>;
type MonitorToolInput = z.infer<InputSchema>;

type MonitorEvent = {
  type: 'stdout' | 'stderr' | 'status' | 'complete' | 'error';
  content: string;
  timestamp: number;
};

type MonitorToolOutput = {
  task_id: string;
  status: string;
  events: MonitorEvent[];
  final_output?: string;
  exit_code?: number | null;
  error?: string;
};

// Track output position for streaming
const outputPositions = new Map<string, number>();

// Get new output since last check
async function getNewOutput(
  task: TaskState,
  position: number,
): Promise<{ output: string; newPosition: number; isComplete: boolean }> {
  try {
    // All task types write to the same output file path via getTaskOutput()
    // Bash tasks write directly, agent tasks use symlinks to their transcripts
    const currentOutput = await getTaskOutput(task.id);
    const newContent = currentOutput.slice(position);
    return {
      output: newContent,
      newPosition: currentOutput.length,
      isComplete: task.status !== 'running' && task.status !== 'pending',
    };
  } catch {
    // File not ready yet
    return { output: '', newPosition: position, isComplete: false };
  }
}

// Parse output into events
function parseOutputToEvents(output: string, _lastPosition: number): MonitorEvent[] {
  if (!output) return [];

  const lines = output.split('\n');
  const events: MonitorEvent[] = [];

  for (const line of lines) {
    if (line.trim()) {
      events.push({
        type: 'stdout',
        content: line,
        timestamp: Date.now(),
      });
    }
  }

  return events;
}

export const MonitorTool: Tool<InputSchema, MonitorToolOutput> = buildTool({
  name: MONITOR_TOOL_NAME,
  searchHint: 'stream events follow logs monitor background task',
  maxResultSizeChars: 100_000,
  shouldDefer: true,

  userFacingName() {
    return 'Monitor';
  },

  get inputSchema(): InputSchema {
    return inputSchema();
  },

  async description() {
    return 'Stream events from a background task in real-time. Monitor stdout/stderr output, status changes, and completion. Works with all task types: local bash shells, local agents, remote agents, workflow tasks, and more. Use for watching logs, following build output, or polling task status.';
  },

  isReadOnly() {
    return true;
  },

  isConcurrencySafe() {
    return true;
  },

  toAutoClassifierInput(input) {
    return input.task_id;
  },

  async prompt() {
    return `Monitors a background task and streams its events in real-time.

- Takes a task_id to identify which task to monitor
- Streams stdout/stderr events as they become available
- Reports status changes (pending -> running -> complete/error)
- Use timeout to limit monitoring duration
- Works with all task types: local bash shells, local agents, remote agents, workflow tasks, etc.
- Ideal for watching logs, following build output, or polling task status
- Returns accumulated events with final output when task completes or times out`;
  },

  async validateInput({ task_id }, { getAppState }) {
    if (!task_id) {
      return {
        result: false,
        message: 'Task ID is required',
        errorCode: 1,
      };
    }

    const appState = getAppState();
    const task = appState.tasks?.[task_id] as TaskState | undefined;

    if (!task) {
      return {
        result: false,
        message: `No task found with ID: ${task_id}`,
        errorCode: 2,
      };
    }

    return { result: true };
  },

  async call(input: MonitorToolInput, toolUseContext, _canUseTool, _parentMessage, onProgress) {
    const { task_id, timeout } = input;

    const appState = toolUseContext.getAppState();
    let task = appState.tasks?.[task_id] as TaskState | undefined;

    if (!task) {
      throw new Error(`No task found with ID: ${task_id}`);
    }

    const events: MonitorEvent[] = [];
    let position = outputPositions.get(task_id) || 0;
    const startTime = Date.now();
    const isComplete = task.status !== 'running' && task.status !== 'pending';

    // Report initial status
    if (onProgress) {
      onProgress({
        toolUseID: `monitor-${task_id}-${Date.now()}`,
        data: {
          type: 'status',
          status: task.status,
          description: task.description,
          message: `Monitoring task: ${task.description || task_id}`,
        },
      });
    }

    // If already complete, get final output
    if (isComplete) {
      const { output, newPosition } = await getNewOutput(task, 0);
      if (output) {
        events.push(...parseOutputToEvents(output, 0));
      }
      outputPositions.set(task_id, newPosition);

      return {
        data: {
          task_id,
          status: task.status,
          events,
          final_output: output,
          exit_code: isLocalShellTask(task) ? task.result?.code : undefined,
          error: (task as any).error,
        },
      };
    }

    // Poll for new output
    while (Date.now() - startTime < timeout) {
      // Check abort signal
      if (toolUseContext.abortController?.signal.aborted) {
        break;
      }

      const currentTask = toolUseContext.getAppState().tasks?.[task_id] as TaskState | undefined;
      if (!currentTask) {
        events.push({
          type: 'error',
          content: 'Task not found',
          timestamp: Date.now(),
        });
        break;
      }

      const { output, newPosition, isComplete: taskComplete } = await getNewOutput(currentTask, position);

      if (output && onProgress) {
        const newEvents = parseOutputToEvents(output, position);
        for (const event of newEvents) {
          events.push(event);
          onProgress({
            toolUseID: `monitor-${task_id}-${Date.now()}`,
            data: event,
          });
        }
        position = newPosition;
        outputPositions.set(task_id, position);
      }

      if (taskComplete) {
        events.push({
          type: 'complete',
          content: `Task completed with status: ${currentTask.status}`,
          timestamp: Date.now(),
        });
        break;
      }

      // Update status if changed
      if (currentTask.status !== task.status) {
        task = currentTask;
        events.push({
          type: 'status',
          content: `Status changed to: ${currentTask.status}`,
          timestamp: Date.now(),
        });
      }

      await sleep(500); // Poll every 500ms
    }

    // Timeout - get any remaining output
    if (Date.now() - startTime >= timeout) {
      events.push({
        type: 'status',
        content: 'Monitoring timed out',
        timestamp: Date.now(),
      });
    }

    // Get final output
    const currentTask = toolUseContext.getAppState().tasks?.[task_id] as TaskState | undefined;
    let finalOutput = '';
    if (currentTask) {
      const { output } = await getNewOutput(currentTask, position);
      finalOutput = output;
    }

    return {
      data: {
        task_id,
        status: currentTask?.status || task.status,
        events,
        final_output: finalOutput || undefined,
        exit_code: currentTask && isLocalShellTask(currentTask) ? currentTask.result?.code : undefined,
        error: (currentTask as any)?.error,
      },
    };
  },

  mapToolResultToToolResultBlockParam(data, toolUseID) {
    const parts: string[] = [];
    parts.push(`<task_id>${data.task_id}</task_id>`);
    parts.push(`<status>${data.status}</status>`);

    if (data.events.length > 0) {
      parts.push(`<event_count>${data.events.length}</event_count>`);
    }

    if (data.final_output?.trim()) {
      const { content } = formatTaskOutput(data.final_output, data.task_id);
      parts.push(`<final_output>\n${content.trimEnd()}\n</final_output>`);
    }

    if (data.exit_code !== undefined && data.exit_code !== null) {
      parts.push(`<exit_code>${data.exit_code}</exit_code>`);
    }

    if (data.error) {
      parts.push(`<error>${data.error}</error>`);
    }

    return {
      tool_use_id: toolUseID,
      type: 'tool_result' as const,
      content: parts.join('\n\n'),
    };
  },

  renderToolUseMessage(input) {
    return `monitoring ${input.task_id}`;
  },

  renderToolUseTag(input) {
    return <Text dimColor> {input.task_id}</Text>;
  },

  renderToolUseProgressMessage(progressMessages) {
    const lastProgress = progressMessages[progressMessages.length - 1];
    const progressData = lastProgress?.data as MonitorEvent | undefined;

    return (
      <Box flexDirection="column">
        {progressData && progressData.type === 'status' && <Text dimColor>{progressData.content}</Text>}
        {progressData && progressData.type === 'stdout' && (
          <Text dimColor>
            {'>'} {progressData.content.slice(0, 100)}
          </Text>
        )}
        <Text>
          {'  '}Monitoring task... <Text dimColor>(esc to give additional instructions)</Text>
        </Text>
      </Box>
    );
  },

  renderToolResultMessage(content) {
    const result: MonitorToolOutput = typeof content === 'string' ? JSON.parse(content) : content;

    return (
      <Box flexDirection="column">
        <Text>
          Monitored task: <Text bold>{result.task_id}</Text> [{result.status}]
        </Text>
        {result.events.length > 0 && <Text dimColor>{result.events.length} events streamed</Text>}
        {result.final_output && (
          <Box flexDirection="column" marginTop={1}>
            <Text dimColor>Final output:</Text>
            <Text>
              {result.final_output.slice(0, 500)}
              {result.final_output.length > 500 ? '...' : ''}
            </Text>
          </Box>
        )}
      </Box>
    );
  },

  renderToolUseRejectedMessage() {
    return <Text color="red">Monitor request rejected</Text>;
  },

  renderToolUseErrorMessage(result) {
    return <Text color="red">Monitor error: {result.message}</Text>;
  },
});

export default MonitorTool;
