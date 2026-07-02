/**
 * peerPersistence — durable storage for the peer system.
 *
 * Persists joined connections, chat messages, todos, and swarm tags to
 * ~/.clew/peer/state.json so peer state survives CLI restarts.
 *
 * Load is synchronous (called from the PeerStore constructor); saves are
 * debounced and fire-and-forget so hot paths never block on disk I/O.
 */

import { mkdirSync, readFileSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { logForDebugging } from '../utils/debug.js';
import { getClewConfigHomeDir } from '../utils/envUtils.js';
import type { MeshChatMessage, MeshTodo, PeerInfo } from './types.js';

export interface PersistedPeerState {
  version: 1;
  /** Explicitly joined connections (rehydrated as offline until pinged) */
  connections: PeerInfo[];
  /** Chat history (capped) */
  messages: MeshChatMessage[];
  /** Todos (capped) */
  todos: MeshTodo[];
  /** Display name / role tags, keyed by peer ID */
  swarmTags: Record<string, { displayName?: string; role?: string }>;
}

/** Keep the file bounded — oldest entries are dropped first. */
export const MAX_PERSISTED_MESSAGES = 500;
export const MAX_PERSISTED_TODOS = 200;

const SAVE_DEBOUNCE_MS = 500;

export function getPeerStatePath(): string {
  return join(getClewConfigHomeDir(), 'peer', 'state.json');
}

/**
 * Load persisted peer state. Returns null when no state exists or the
 * file is unreadable/corrupt (peer system starts fresh in that case).
 */
export function loadPeerState(statePath = getPeerStatePath()): PersistedPeerState | null {
  try {
    const raw = readFileSync(statePath, 'utf-8');
    const parsed = JSON.parse(raw) as PersistedPeerState;
    if (parsed?.version !== 1 || !Array.isArray(parsed.connections)) return null;
    return {
      version: 1,
      connections: parsed.connections,
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      todos: Array.isArray(parsed.todos) ? parsed.todos : [],
      swarmTags: parsed.swarmTags && typeof parsed.swarmTags === 'object' ? parsed.swarmTags : {},
    };
  } catch {
    return null;
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSave: (() => PersistedPeerState) | null = null;

/**
 * Schedule a debounced save. The snapshot callback runs at flush time so
 * rapid mutations coalesce into a single write of the latest state.
 */
export function schedulePeerStateSave(snapshot: () => PersistedPeerState, statePath = getPeerStatePath()): void {
  pendingSave = snapshot;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const snap = pendingSave;
    pendingSave = null;
    if (snap) void savePeerState(snap(), statePath);
  }, SAVE_DEBOUNCE_MS);
  // Never keep the process alive just to flush peer state
  saveTimer.unref?.();
}

/** Immediately persist peer state (atomic write via temp file + rename). */
export async function savePeerState(state: PersistedPeerState, statePath = getPeerStatePath()): Promise<void> {
  try {
    const bounded: PersistedPeerState = {
      ...state,
      messages: state.messages.slice(-MAX_PERSISTED_MESSAGES),
      todos: state.todos.slice(-MAX_PERSISTED_TODOS),
    };
    await mkdir(dirname(statePath), { recursive: true });
    const tmp = `${statePath}.tmp`;
    await writeFile(tmp, JSON.stringify(bounded), 'utf-8');
    await rename(tmp, statePath);
  } catch (err) {
    logForDebugging(`[peerPersistence] save failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Flush any pending debounced save right now (used on shutdown/destroy). */
export async function flushPeerStateSave(statePath = getPeerStatePath()): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const snap = pendingSave;
  pendingSave = null;
  if (snap) await savePeerState(snap(), statePath);
}

/** Ensure the peer dir exists (sync, safe to call from constructors). */
export function ensurePeerDirSync(): void {
  try {
    mkdirSync(dirname(getPeerStatePath()), { recursive: true });
  } catch {
    // Non-fatal
  }
}
