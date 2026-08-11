/**
 * Session catalog sources — normalize clew's three session stores into the one
 * summary shape the catalog renders from.
 *
 *   supervisor  background sessions owned by the daemon (survive this process)
 *   task        in-process agents dispatched by the current session
 *   transcript  archived sessions on disk, the durable catalog
 *
 * Only this module knows where sessions come from; everything else works
 * against CatalogSessionSummary / SavedCatalogSession.
 */

import { getSessionId } from '../../bootstrap/state.js';
import { listSessions, pingDaemon } from '../../services/Supervisor/ipcClient.js';
import { isLocalAgentTask, type LocalAgentTaskState } from '../../tasks/LocalAgentTask/LocalAgentTask.js';
import type { TaskState } from '../../tasks/types.js';
import type { LogOption } from '../../types/logs.js';
import { getCwd } from '../../utils/cwd.js';
import { loadAllProjectsMessageLogs, loadMessageLogs } from '../../utils/sessionStorage.js';
import { type CatalogRecord, reconcileCatalogSessions } from './sessionCatalogState.js';
import type { CatalogHeartbeat, CatalogSessionSummary, SavedCatalogSession } from './types.js';

/** One roster row as the supervisor's `list` command reports it. */
type SupervisorSession = {
  id?: string;
  sessionId?: string;
  shortId?: string;
  pid?: number;
  cwd?: string;
  status?: string;
  name?: string;
  customName?: string;
  agentType?: string;
  prompt?: string;
  model?: string;
  startedAt?: number;
  updatedAt?: number;
  awaitingInput?: boolean;
  awaiting_input?: boolean;
};

function toIso(value: number | undefined): string | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? new Date(value).toISOString() : undefined;
}

/** Roster entries that are no longer executing are archived, not idle. */
function supervisorSessionToSummary(session: SupervisorSession): CatalogSessionSummary | undefined {
  const id = String(session.id ?? session.sessionId ?? '');
  if (!id) return undefined;

  const awaitingInput =
    session.status === 'awaiting_input' || session.awaitingInput === true || session.awaiting_input === true;
  const running = session.status === 'running' && !awaitingInput;
  const live = running || awaitingInput;

  return {
    id,
    sessionId: String(session.sessionId ?? id),
    activeSessionId: live ? id : undefined,
    lifecycle: live ? 'live' : 'archived',
    activity: running ? 'working' : 'idle',
    runtimeKind: 'top-level',
    sessionName: session.customName ?? session.name,
    firstMessage: session.prompt,
    cwd: session.cwd ?? getCwd(),
    model: session.model,
    messageCount: 0,
    isStreaming: running,
    taskState:
      session.status === 'failed'
        ? 'failed'
        : session.status === 'stopped'
          ? 'stopped'
          : session.status === 'completed'
            ? 'completed'
            : undefined,
    created: toIso(session.startedAt),
    modified: toIso(session.updatedAt ?? session.startedAt),
    source: 'supervisor',
  };
}

/**
 * Read the supervisor roster. Returns an empty list when the daemon is not
 * running — the catalog still has tasks and transcripts to show, so a missing
 * daemon must not be an error.
 */
export async function loadSupervisorSessions(): Promise<CatalogSessionSummary[]> {
  if (!(await pingDaemon())) return [];
  const response = await listSessions();
  if (!response.ok) return [];
  const sessions = (response.data as { sessions?: SupervisorSession[] } | undefined)?.sessions ?? [];
  return sessions
    .map(supervisorSessionToSummary)
    .filter((summary): summary is CatalogSessionSummary => summary !== undefined);
}

/**
 * In-process agents are subagents of the session that dispatched them, which is
 * what gives the catalog a real hierarchy to drill into.
 */
export function localAgentTaskToSummary(
  task: LocalAgentTaskState,
  parentSessionId: string,
  parentCwd: string,
): CatalogSessionSummary {
  const running = task.status === 'running' || task.status === 'pending';
  const toolName = task.progress?.lastActivity?.toolName;
  // The agent tool that blocks on the user is the one signal a subagent is
  // waiting rather than working.
  const needsInput = toolName === 'AskUserQuestionTool';

  return {
    id: task.id,
    sessionId: task.agentId || task.id,
    activeSessionId: running ? task.id : undefined,
    parentSessionId,
    lifecycle: running ? 'live' : 'archived',
    activity: running && !needsInput ? 'working' : 'idle',
    runtimeKind: 'subagent',
    depth: 1,
    sessionName: task.description,
    firstMessage: task.prompt,
    summary: task.progress?.lastActivity?.activityDescription,
    cwd: parentCwd,
    model: task.model,
    messageCount: task.messages?.length ?? 0,
    queuedCount: task.pendingMessages.length,
    isStreaming: running && !needsInput,
    isRunningTools: running && Boolean(toolName) && !needsInput,
    // The dispatch prompt is this subagent's program; ctrl+o reveals it.
    spawnCode: task.prompt,
    taskState:
      task.status === 'completed'
        ? 'completed'
        : task.status === 'failed'
          ? 'failed'
          : task.status === 'killed'
            ? 'stopped'
            : running
              ? 'in_progress'
              : undefined,
    created: new Date(task.startTime).toISOString(),
    modified: new Date(task.endTime ?? task.startTime).toISOString(),
    source: 'task',
  };
}

export function localAgentTasksToSummaries(
  tasks: Record<string, TaskState> | undefined,
  parentSessionId: string = getSessionId(),
  parentCwd: string = getCwd(),
): CatalogSessionSummary[] {
  return Object.values(tasks ?? {})
    .filter(isLocalAgentTask)
    .map(task => localAgentTaskToSummary(task, parentSessionId, parentCwd));
}

function logToSavedSession(log: LogOption): SavedCatalogSession | undefined {
  const id = log.sessionId;
  const path = log.fullPath;
  if (!id || !path) return undefined;
  return {
    id,
    path,
    name: log.customTitle ?? log.agentName,
    firstMessage: log.firstPrompt,
    summary: log.summary,
    cwd: log.projectPath ?? getCwd(),
    messageCount: log.messageCount,
    created: log.created,
    modified: log.modified,
  };
}

export type SavedCatalogOptions = {
  /** Include sessions from every project directory, not just this one. */
  allProjects?: boolean;
  /** Cap on session files read per project. */
  limit?: number;
};

export async function loadSavedCatalogSessions(options: SavedCatalogOptions = {}): Promise<SavedCatalogSession[]> {
  const logs = options.allProjects
    ? await loadAllProjectsMessageLogs(options.limit)
    : await loadMessageLogs(options.limit);
  return logs
    .filter(log => !log.isSidechain)
    .map(logToSavedSession)
    .filter((saved): saved is SavedCatalogSession => saved !== undefined);
}

export type LoadCatalogOptions = SavedCatalogOptions & {
  /** In-process tasks from AppState. */
  tasks?: Record<string, TaskState>;
  /** Recurring jobs owned by sessions; sessions holding one read as Running. */
  heartbeats?: readonly CatalogHeartbeat[];
  /** Skip the durable transcript catalog (the slow half of a refresh). */
  skipSaved?: boolean;
};

/**
 * Load and reconcile the whole catalog. Supervisor and transcript reads are
 * independent, so they run together; a failure in either leaves the other's
 * rows intact.
 */
export async function loadSessionCatalog(options: LoadCatalogOptions = {}): Promise<CatalogRecord[]> {
  const [supervisor, saved] = await Promise.all([
    loadSupervisorSessions().catch(() => [] as CatalogSessionSummary[]),
    options.skipSaved
      ? Promise.resolve([] as SavedCatalogSession[])
      : loadSavedCatalogSessions(options).catch(() => [] as SavedCatalogSession[]),
  ]);
  const live = [...supervisor, ...localAgentTasksToSummaries(options.tasks)];
  return reconcileCatalogSessions(live, saved, options.heartbeats ?? []);
}
