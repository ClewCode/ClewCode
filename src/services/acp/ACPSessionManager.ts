/**
 * ACP Session Manager — tracks active ACP sessions and their lifecycle.
 *
 * Maps ACP sessions (from `session/new`) to internal session IDs,
 * so we can route `session/prompt` calls to the correct session context.
 */

export interface ACPSession {
  /** ACP session ID (from client) */
  acpSessionId: string;

  /** Internal session ID used by Clew Code */
  internalSessionId: string;

  /** When the session was created */
  createdAt: number;

  /** Last activity timestamp */
  lastActivityAt: number;
}

const sessions = new Map<string, ACPSession>();

/**
 * Create or get a session mapping.
 */
export function createSession(acpSessionId: string): ACPSession {
  const existing = sessions.get(acpSessionId);
  if (existing) {
    existing.lastActivityAt = Date.now();
    return existing;
  }

  const session: ACPSession = {
    acpSessionId,
    internalSessionId: `acp_${acpSessionId}_${Date.now()}`,
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
  };
  sessions.set(acpSessionId, session);
  return session;
}

/**
 * Get a session by its ACP session ID.
 */
export function getSession(acpSessionId: string): ACPSession | undefined {
  return sessions.get(acpSessionId);
}

/**
 * Remove a session.
 */
export function removeSession(acpSessionId: string): boolean {
  return sessions.delete(acpSessionId);
}

/**
 * List all active sessions.
 */
export function listSessions(): ACPSession[] {
  return Array.from(sessions.values());
}

/**
 * Clear all sessions (used for testing).
 */
export function clearSessions(): void {
  sessions.clear();
}

/**
 * Clean up stale sessions (older than maxAgeMinutes).
 */
export function cleanupSessions(maxAgeMinutes: number): number {
  const now = Date.now();
  let removed = 0;
  for (const [id, session] of sessions) {
    if (now - session.lastActivityAt > maxAgeMinutes * 60 * 1000) {
      sessions.delete(id);
      removed++;
    }
  }
  return removed;
}
