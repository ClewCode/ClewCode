/**
 * Hook for managing session backgrounding (Ctrl+B to background/foreground sessions).
 *
 * Handles:
 * - Calling onBackgroundQuery to spawn a background task for the current query
 * - Re-backgrounding foregrounded tasks
 * - Syncing foregrounded task messages/state to main view
 * - ← (left arrow) on empty prompt to background and open agent view
 * - Ctrl+Z to force detach from agent view
 * - /bg slash command support
 */

import { useCallback, useEffect, useRef } from 'react';
import { useAppState, useSetAppState } from '../state/AppState.js';
import type { Message } from '../types/message.js';

type UseSessionBackgroundingProps = {
  setMessages: (messages: Message[] | ((prev: Message[]) => Message[])) => void;
  setIsLoading: (loading: boolean) => void;
  resetLoadingState: () => void;
  setAbortController: (controller: AbortController | null) => void;
  onBackgroundQuery: () => void;
  /** G47: Called when a background task is foregrounded — used by REPL to
   *  repin scroll position so the user sees the latest messages. */
  onForegrounded?: () => void;
};

type UseSessionBackgroundingResult = {
  /** Call when user wants to background (Ctrl+B) */
  handleBackgroundSession: () => void;
};

import { setForegroundedSessionActive } from './foregroundedSessionFlag.js';

export function useSessionBackgrounding({
  setMessages,
  setIsLoading,
  resetLoadingState,
  setAbortController,
  onBackgroundQuery,
  onForegrounded,
}: UseSessionBackgroundingProps): UseSessionBackgroundingResult {
  const foregroundedTaskId = useAppState(s => s.foregroundedTaskId);
  const foregroundedTask = useAppState(s => (s.foregroundedTaskId ? s.tasks[s.foregroundedTaskId] : undefined));
  const setAppState = useSetAppState();
  const lastSyncedMessagesLengthRef = useRef<number>(0);
  // G47: Track foregrounding transitions to trigger scroll repin on re-attach
  const prevForegroundedTaskIdRef = useRef<string | undefined>(undefined);

  const handleBackgroundSession = useCallback(() => {
    if (foregroundedTaskId) {
      // Re-background the foregrounded task
      setAppState(prev => {
        const taskId = prev.foregroundedTaskId;
        if (!taskId) return prev;
        const task = prev.tasks[taskId];
        if (!task) {
          return { ...prev, foregroundedTaskId: undefined };
        }
        return {
          ...prev,
          foregroundedTaskId: undefined,
          tasks: {
            ...prev.tasks,
            [taskId]: { ...task, isBackgrounded: true },
          },
        };
      });
      setMessages([]);
      resetLoadingState();
      setAbortController(null);
      return;
    }

    onBackgroundQuery();
  }, [foregroundedTaskId, setAppState, setMessages, resetLoadingState, setAbortController, onBackgroundQuery]);

  // Sync foregrounded task's messages and loading state to the main view
  useEffect(() => {
    // Update global flag for Ctrl+Z force-detach detection
    setForegroundedSessionActive(!!foregroundedTaskId);

    if (!foregroundedTaskId) {
      // Reset when no foregrounded task
      lastSyncedMessagesLengthRef.current = 0;
      return;
    }

    if (foregroundedTask?.type !== 'local_agent') {
      setAppState(prev => ({ ...prev, foregroundedTaskId: undefined }));
      resetLoadingState();
      lastSyncedMessagesLengthRef.current = 0;
      return;
    }

    // Sync messages from background task to main view
    // Only update if messages have actually changed to avoid redundant renders
    const taskMessages = foregroundedTask.messages ?? [];
    if (taskMessages.length !== lastSyncedMessagesLengthRef.current) {
      lastSyncedMessagesLengthRef.current = taskMessages.length;
      setMessages([...taskMessages]);
      // G47: Notify REPL to repin scroll on first sync after foreground
      if (prevForegroundedTaskIdRef.current === undefined && foregroundedTaskId !== undefined) {
        onForegrounded?.();
      }
    }
    prevForegroundedTaskIdRef.current = foregroundedTaskId;

    if (foregroundedTask.status === 'running') {
      // Check if the task was aborted (user pressed Escape)
      const taskAbortController = foregroundedTask.abortController;
      if (taskAbortController?.signal.aborted) {
        // Task was aborted - clear foregrounded state immediately
        setAppState(prev => {
          if (!prev.foregroundedTaskId) return prev;
          const task = prev.tasks[prev.foregroundedTaskId];
          if (!task) return { ...prev, foregroundedTaskId: undefined };
          return {
            ...prev,
            foregroundedTaskId: undefined,
            tasks: {
              ...prev.tasks,
              [prev.foregroundedTaskId]: { ...task, isBackgrounded: true },
            },
          };
        });
        resetLoadingState();
        setAbortController(null);
        lastSyncedMessagesLengthRef.current = 0;
        return;
      }

      setIsLoading(true);
      // Set abort controller to the foregrounded task's controller for Escape handling
      if (taskAbortController) {
        setAbortController(taskAbortController);
      }
    } else {
      // Task completed - restore to background and clear foregrounded view
      setAppState(prev => {
        const taskId = prev.foregroundedTaskId;
        if (!taskId) return prev;
        const task = prev.tasks[taskId];
        if (!task) return { ...prev, foregroundedTaskId: undefined };
        return {
          ...prev,
          foregroundedTaskId: undefined,
          tasks: { ...prev.tasks, [taskId]: { ...task, isBackgrounded: true } },
        };
      });
      resetLoadingState();
      setAbortController(null);
      lastSyncedMessagesLengthRef.current = 0;
    }
  }, [
    foregroundedTaskId,
    foregroundedTask,
    setAppState,
    setMessages,
    setIsLoading,
    resetLoadingState,
    setAbortController,
    onForegrounded,
  ]);

  return {
    handleBackgroundSession,
  };
}
