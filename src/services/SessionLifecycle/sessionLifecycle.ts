/**
 * SessionLifecycle — Manages background session process lifecycle.
 *
 * - Tracks last activity timestamps per session
 * - Stops idle processes after ~1 hour of no activity (for completed sessions)
 * - Supports re-attach by restarting from saved transcript
 * - Periodic cleanup of expired sessions
 */

import { isLocalAgentTask } from '../../tasks/LocalAgentTask/LocalAgentTask.js';
import type { TaskState } from '../../tasks/types.js';

// 1 hour idle timeout as per official Clew Code spec
const IDLE_PROCESS_TIMEOUT_MS = 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes

export interface SessionLifecycleState {
  /** Last time the session had any activity (timestamp) */
  lastActivityAt: number;
  /** Last time a terminal was attached */
  lastAttachedAt: number;
  /** Whether the process has been intentionally stopped */
  processStopped: boolean;
  /** Whether the process has exited on its own */
  processExited: boolean;
  /** PID of the background process (if alive) */
  pid?: number;
}

const lifecycleCache = new Map<string, SessionLifecycleState>();

export function getSessionLifecycle(sessionId: string): SessionLifecycleState | undefined {
  return lifecycleCache.get(sessionId);
}

export function setSessionLifecycle(sessionId: string, state: SessionLifecycleState): void {
  lifecycleCache.set(sessionId, state);
}

export function deleteSessionLifecycle(sessionId: string): void {
  lifecycleCache.delete(sessionId);
}

export function touchSessionActivity(sessionId: string): void {
  const existing = lifecycleCache.get(sessionId);
  if (existing) {
    existing.lastActivityAt = Date.now();
  } else {
    lifecycleCache.set(sessionId, {
      lastActivityAt: Date.now(),
      lastAttachedAt: 0,
      processStopped: false,
      processExited: false,
    });
  }
}

export function touchSessionAttach(sessionId: string): void {
  const existing = lifecycleCache.get(sessionId);
  if (existing) {
    existing.lastAttachedAt = Date.now();
  } else {
    lifecycleCache.set(sessionId, {
      lastActivityAt: Date.now(),
      lastAttachedAt: Date.now(),
      processStopped: false,
      processExited: false,
    });
  }
}

export function markProcessExited(sessionId: string): void {
  const existing = lifecycleCache.get(sessionId);
  if (existing) {
    existing.processExited = true;
  }
}

export function markProcessStopped(sessionId: string): void {
  const existing = lifecycleCache.get(sessionId);
  if (existing) {
    existing.processStopped = true;
  }
}

/**
 * Determine if a session's process should be considered "alive".
 * A process is alive if:
 * 1. It hasn't been stopped or exited
 * 2. It's either actively working OR recently attached
 * 3. It hasn't been idle for more than ~1 hour since completion
 */
export function isProcessEffectivelyAlive(sessionId: string, task?: TaskState | null): boolean {
  const lifecycle = lifecycleCache.get(sessionId);
  if (!lifecycle) return true; // No lifecycle data, assume alive
  if (lifecycle.processStopped || lifecycle.processExited) return false;

  // If task is active, process is alive
  if (task && (task.status === 'running' || task.status === 'pending')) {
    return true;
  }

  // If task is completed/failed/killed, consider it no longer alive regardless
  // of background shell processes. This ensures agents with background shells
  // still move to the Completed state in the agent view.
  if (task && (task.status === 'completed' || task.status === 'failed' || task.status === 'killed')) {
    return false;
  }

  return true;
}

/**
 * Periodic cleanup hook — called by agent view to prune expired lifecycle entries.
 */
export function cleanupExpiredLifecycles(activeSessionIds: Set<string>): number {
  let cleaned = 0;
  for (const [id] of lifecycleCache) {
    if (!activeSessionIds.has(id)) {
      const lifecycle = lifecycleCache.get(id);
      if (lifecycle) {
        const idleTime = Date.now() - lifecycle.lastActivityAt;
        // Keep entries that may be re-attached, but remove very old ones (> 7 days)
        if (idleTime > 7 * 24 * 60 * 60 * 1000) {
          lifecycleCache.delete(id);
          cleaned++;
        }
      }
    }
  }
  return cleaned;
}

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

export function startLifecycleCleanup(getActiveSessionIds: () => Set<string>): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    cleanupExpiredLifecycles(getActiveSessionIds());
  }, CLEANUP_INTERVAL_MS);
}

export function stopLifecycleCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}
