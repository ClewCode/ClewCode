import { describe, expect, it, test } from 'bun:test';
import type { AppState } from '../../state/AppState.js';
import type { Message } from '../../types/message.js';
import {
  createProgressTracker,
  getProgressUpdate,
  getTokenCountFromTracker,
  isLocalAgentTask,
  killAllRunningAgentTasks,
  killAsyncAgent,
  type LocalAgentTaskState,
  updateProgressFromMessage,
} from './LocalAgentTask.js';

describe('LocalAgentTask progress tracking', () => {
  test('initializes empty progress tracker', () => {
    const tracker = createProgressTracker();
    expect(tracker.toolUseCount).toBe(0);
    expect(tracker.latestInputTokens).toBe(0);
    expect(tracker.cumulativeOutputTokens).toBe(0);
    expect(tracker.recentActivities).toEqual([]);
    expect(getTokenCountFromTracker(tracker)).toBe(0);
  });

  test('accumulates tokens and tool activities from assistant message', () => {
    const tracker = createProgressTracker();

    const assistantMsg: Message = {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 't1', name: 'FileRead', input: { path: 'test.ts' } },
          { type: 'text', text: 'reading file' },
        ],
        usage: {
          input_tokens: 150,
          output_tokens: 50,
          cache_creation_input_tokens: 10,
          cache_read_input_tokens: 40,
        },
      } as any,
      uuid: 'msg-1' as any,
      timestamp: new Date().toISOString(),
    };

    updateProgressFromMessage(tracker, assistantMsg);

    expect(tracker.toolUseCount).toBe(1);
    expect(tracker.latestInputTokens).toBe(200); // 150 + 10 + 40
    expect(tracker.cumulativeOutputTokens).toBe(50);
    expect(getTokenCountFromTracker(tracker)).toBe(250);
    expect(tracker.recentActivities.length).toBe(1);
    expect(tracker.recentActivities[0].toolName).toBe('FileRead');

    const update = getProgressUpdate(tracker);
    expect(update.toolUseCount).toBe(1);
    expect(update.tokenCount).toBe(250);
    expect(update.lastActivity?.toolName).toBe('FileRead');
  });
});

describe('LocalAgentTask lifecycle and termination', () => {
  it('identifies local agent tasks', () => {
    const localTask: Partial<LocalAgentTaskState> = {
      type: 'local_agent',
      status: 'running',
    };

    const shellTask = {
      type: 'shell',
      status: 'running',
    };

    expect(isLocalAgentTask(localTask as any)).toBe(true);
    expect(isLocalAgentTask(shellTask as any)).toBe(false);
  });

  it('aborts controller and sets status to killed on killAsyncAgent', () => {
    const abortController = new AbortController();
    let cleanupCalled = false;

    let appState: AppState = {
      tasks: {
        'task-1': {
          type: 'local_agent',
          status: 'running',
          agentId: 'agent-1',
          agentType: 'Explore',
          prompt: 'Find code',
          retrieved: false,
          lastReportedToolCount: 0,
          lastReportedTokenCount: 0,
          isBackgrounded: true,
          pendingMessages: [],
          retain: false,
          abortController,
          unregisterCleanup: () => {
            cleanupCalled = true;
          },
        } as any,
      },
    } as any;

    const setAppState = (f: (prev: AppState) => AppState) => {
      appState = f(appState);
    };

    killAsyncAgent('task-1', setAppState);

    expect(abortController.signal.aborted).toBe(true);
    expect(cleanupCalled).toBe(true);
    expect(appState.tasks['task-1'].status).toBe('killed');
  });

  it('killAllRunningAgentTasks terminates all running local agent tasks', () => {
    const ac1 = new AbortController();
    const ac2 = new AbortController();

    let appState: AppState = {
      tasks: {
        'task-1': {
          type: 'local_agent',
          status: 'running',
          abortController: ac1,
        } as any,
        'task-2': {
          type: 'local_agent',
          status: 'running',
          abortController: ac2,
        } as any,
        'task-3': {
          type: 'local_agent',
          status: 'completed',
        } as any,
      },
    } as any;

    const setAppState = (f: (prev: AppState) => AppState) => {
      appState = f(appState);
    };

    killAllRunningAgentTasks(appState.tasks, setAppState);

    expect(ac1.signal.aborted).toBe(true);
    expect(ac2.signal.aborted).toBe(true);
    expect(appState.tasks['task-1'].status).toBe('killed');
    expect(appState.tasks['task-2'].status).toBe('killed');
    expect(appState.tasks['task-3'].status).toBe('completed');
  });
});
