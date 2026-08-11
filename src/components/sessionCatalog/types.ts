/**
 * Session catalog types.
 *
 * The catalog unifies three very different session sources behind one row
 * shape: supervisor-managed background sessions, in-process agent tasks, and
 * archived transcripts on disk. Everything downstream (sectioning, hierarchy,
 * scoping, rendering) works against these types only.
 */

export type SessionCatalogSection = 'running' | 'idle' | 'inactive';

export type SessionCatalogTaskState = 'in_progress' | 'completed' | 'failed' | 'stopped';

/** Where a summary came from. Kept on the row so actions can pick the right API. */
export type SessionCatalogSource = 'supervisor' | 'task' | 'transcript';

/** Live-or-archived view of one session, normalized across sources. */
export type CatalogSessionSummary = {
  /** Runtime id — the supervisor entry id or in-process task id. */
  id: string;
  /** Durable session id, stable across attach/detach and restarts. */
  sessionId: string;
  /** Set only while the session has a live runtime. */
  activeSessionId?: string;
  /** Absolute path of the transcript file, when one exists. */
  sessionFile?: string;
  parentSessionId?: string;
  parentActiveSessionId?: string;
  parentSessionPath?: string;
  lifecycle: 'live' | 'archived';
  activity: 'working' | 'idle';
  runtimeKind: 'top-level' | 'subagent';
  /** Nesting depth of a subagent below its top-level agent. */
  depth?: number;
  sessionName?: string;
  firstMessage?: string;
  /** Short background summary rendered as a dim suffix on the row. */
  summary?: string;
  cwd: string;
  model?: string;
  messageCount: number;
  queuedCount?: number;
  isStreaming?: boolean;
  isRunningTools?: boolean;
  isBashRunning?: boolean;
  isCompacting?: boolean;
  hasRunningSubagents?: boolean;
  hasActiveHeartbeat?: boolean;
  taskState?: SessionCatalogTaskState;
  /** Prompt/program that spawned this subagent, revealed with ctrl+o. */
  spawnCode?: string;
  /** ISO timestamps. */
  created?: string;
  modified?: string;
  source: SessionCatalogSource;
};

/** Durable transcript entry; enriches or stands in for a live session. */
export type SavedCatalogSession = {
  id: string;
  path: string;
  name?: string;
  firstMessage?: string;
  /** Extra text folded into the search corpus. */
  allMessagesText?: string;
  summary?: string;
  taskState?: SessionCatalogTaskState;
  cwd: string;
  messageCount: number;
  created: Date;
  modified: Date;
  parentSessionPath?: string;
  depth?: number;
};

/**
 * A recurring job owned by a session (scheduled run, watcher, loop). Sessions
 * with an active job read as Running even when nothing is streaming.
 */
export type CatalogHeartbeat = {
  job: {
    id: string;
    activeSessionId: string;
    status: 'active' | 'idle';
    nextRunAt?: string;
  };
};
