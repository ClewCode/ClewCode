/**
 * BgShellTask — Execute a shell command as a background agent task.
 *
 * When the user types `!bg <command>`, the command runs in the background
 * and appears as a session in the `claude agents` dashboard.
 *
 * Reuses LocalAgentTaskState so it integrates with AgentViewDashboard
 * without any dashboard changes.
 */

import { randomBytes } from 'crypto';
import type { SetAppState } from '../Task.js';
import { createTaskStateBase } from '../Task.js';
import { logForDebugging } from '../utils/debug.js';
import { exec } from '../utils/Shell.js';
import { initTaskOutputAsSymlink } from '../utils/task/diskOutput.js';
import type { LocalAgentTaskState } from './LocalAgentTask/LocalAgentTask.js';

const TASK_ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

function generateBgShellTaskId(): string {
  const bytes = randomBytes(8);
  let id = 'b';
  for (let i = 0; i < 8; i++) {
    id += TASK_ID_ALPHABET[bytes[i]! % TASK_ID_ALPHABET.length];
  }
  return id;
}

/**
 * State shape for a background shell task.
 * Compatible with LocalAgentTaskState for dashboard display.
 */
export type BgShellTaskState = LocalAgentTaskState & {
  agentType: 'bg-shell';
  shellCommand: string;
  shellPid?: number;
};

/**
 * Start a background shell command task.
 * The command runs asynchronously and its status is tracked in app state.
 *
 * @param command - The shell command to execute
 * @param setAppState - React state setter for the app
 * @returns The task ID
 */
export function startBgShellCommand(command: string, setAppState: SetAppState): string {
  const taskId = generateBgShellTaskId();

  // Initialize task output path for live stdout/stderr tracking
  void initTaskOutputAsSymlink(taskId, taskId).catch(err => logForDebugging(`bg-shell init output failed: ${err}`));

  // Register the task in app state
  setAppState(prev => ({
    ...prev,
    tasks: {
      ...prev.tasks,
      [taskId]: {
        ...createTaskStateBase(taskId, 'local_agent', command.slice(0, 80)),
        id: taskId,
        type: 'local_agent' as const,
        status: 'running' as const,
        agentType: 'bg-shell',
        prompt: command,
        shellCommand: command,
        retrieved: false,
        lastReportedToolCount: 0,
        lastReportedTokenCount: 0,
        isBackgrounded: true,
        pendingMessages: [],
        retain: false,
        diskLoaded: false,
        startTime: Date.now(),
        endTime: undefined,
        processRunning: true,
        error: undefined,
        progress: {
          toolUseCount: 0,
          tokenCount: 0,
          lastActivity: {
            toolName: 'BashTool',
            input: { command },
            activityDescription: `Running: ${command.slice(0, 60)}`,
          },
        },
        rowSummary: `! ${command}`,
        cwd: process.cwd(),
        agentCwd: process.cwd(),
        messages: [],
        pinned: false,
        sortOrder: 0,
        customName: undefined,
        notified: false,
      } as unknown as BgShellTaskState,
    },
  }));

  // Execute the shell command in the background
  void executeShellBackground(taskId, command, setAppState);

  return taskId;
}

async function executeShellBackground(taskId: string, command: string, setAppState: SetAppState): Promise<void> {
  try {
    const shellCommand = await exec(command, new AbortController().signal, 'bash', {
      timeout: 0, // no timeout for background tasks
    });

    // Wait for the command to complete
    const result = await shellCommand.result;

    // Update task state with completion status
    setAppState(prev => {
      const task = prev.tasks[taskId];
      if (!task) return prev;

      const success = result.code === 0;
      return {
        ...prev,
        tasks: {
          ...prev.tasks,
          [taskId]: {
            ...task,
            status: success ? ('completed' as const) : ('failed' as const),
            endTime: Date.now(),
            processRunning: false,
            progress: {
              toolUseCount: 0,
              tokenCount: 0,
              lastActivity: {
                toolName: 'BashTool',
                input: { command },
                activityDescription: success
                  ? `Completed (exit ${result.code})`
                  : `Failed (exit ${result.code}): ${result.stderr.slice(0, 100)}`,
              },
            },
            rowSummary: success ? `✓ ${command.slice(0, 60)}` : `✗ ${command.slice(0, 55)} (exit ${result.code})`,
            error: success ? undefined : result.stderr?.slice(0, 500),
          },
        },
      };
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);

    // Update task state with error
    setAppState(prev => {
      const task = prev.tasks[taskId];
      if (!task) return prev;
      return {
        ...prev,
        tasks: {
          ...prev.tasks,
          [taskId]: {
            ...task,
            status: 'failed' as const,
            endTime: Date.now(),
            processRunning: false,
            error: errMsg,
            progress: {
              toolUseCount: 0,
              tokenCount: 0,
              lastActivity: {
                toolName: 'BashTool',
                input: { command },
                activityDescription: `Error: ${errMsg.slice(0, 100)}`,
              },
            },
            rowSummary: `✗ ${command.slice(0, 60)}`,
          },
        },
      };
    });
  }
}
