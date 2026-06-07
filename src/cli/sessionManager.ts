/**
 * SessionManager — CLI commands for managing background sessions via supervisor IPC.
 *
 * Commands:
 * - claude agents                  Open agent view (TUI)
 * - claude agents list             List background sessions (non-TUI)
 * - claude attach <id>             Attach to running session
 * - claude logs <id>               Print recent output from session
 * - claude stop <id>               Gracefully stop a session
 * - claude respawn <id>            Restart stopped session
 * - claude respawn --all           Restart all stopped sessions
 * - claude rm <id>                 Remove session and cleanup worktree
 */

import { randomBytes } from 'crypto';
import {
  attachSession,
  ensureSupervisor,
  getSessionLogs,
  listSessions as listIpcSessions,
  pingDaemon,
  removeSession,
  respawnSession,
  startDaemonSession,
  stopSession,
} from '../services/Supervisor/ipcClient.js';

export type SessionIndexEntry = {
  id: string;
  pid: number;
  cwd: string;
  startedAt: number;
  updatedAt?: number;
  status: string;
  name?: string;
  customName?: string;
  agentType?: string;
  worktreePath?: string;
};

type AgentSessionJsonEntry = {
  id: string;
  status: 'running' | 'awaiting_input' | 'stopped' | 'failed';
  cwd: string;
  session_id: string;
  created_at: string;
  awaiting_input: boolean;
};

function getShortId(sessionId: string): string {
  return sessionId.slice(0, 8);
}

function normalizeAgentSessionStatus(status: unknown): AgentSessionJsonEntry['status'] {
  if (status === 'failed') return 'failed';
  if (status === 'awaiting_input') return 'awaiting_input';
  if (status === 'running') return 'running';
  return 'stopped';
}

export function formatAgentSessionsJson(sessions: unknown[]): { agents: AgentSessionJsonEntry[] } {
  return {
    agents: sessions.map((session: any) => {
      const status = normalizeAgentSessionStatus(session?.status);
      const startedAt = typeof session?.startedAt === 'number' ? session.startedAt : Date.now();
      const sessionId = String(session?.id ?? session?.sessionId ?? '');
      return {
        id: String(session?.agentId ?? session?.id ?? sessionId),
        status,
        cwd: String(session?.cwd ?? ''),
        session_id: sessionId,
        created_at: new Date(startedAt).toISOString(),
        awaiting_input:
          status === 'awaiting_input' || session?.awaitingInput === true || session?.awaiting_input === true,
      };
    }),
  };
}

export async function listSessionsJsonCommand(): Promise<void> {
  const supervisorRunning = await pingDaemon();

  if (!supervisorRunning) {
    console.log(JSON.stringify({ agents: [] }));
    return;
  }

  const result = await listIpcSessions();
  if (!result.ok) {
    console.error(`Error: ${result.error}`);
    process.exit(1);
  }

  const data = result.data as any;
  const sessions: any[] = data?.sessions ?? [];
  console.log(JSON.stringify(formatAgentSessionsJson(sessions)));
}

export async function listSessionsCommand(): Promise<void> {
  const supervisorRunning = await pingDaemon();

  if (!supervisorRunning) {
    console.log('No background sessions (supervisor not running).');
    console.log('');
    console.log('Start one with: clew --bg "<prompt>"');
    console.log('Or open agent view: clew agents');
    return;
  }

  const result = await listIpcSessions();
  if (!result.ok) {
    console.error(`Error: ${result.error}`);
    return;
  }

  const data = result.data as any;
  const sessions: any[] = data?.sessions ?? [];

  if (sessions.length === 0) {
    console.log('No background sessions.');
    console.log('');
    console.log('Start one with: clew --bg "<prompt>"');
    console.log('Or open agent view: clew agents');
    return;
  }

  const now = Date.now();
  const active = sessions.filter((s: any) => s.status === 'running');
  const stopped = sessions.filter((s: any) => s.status !== 'running');

  console.log(
    `${sessions.length} session${sessions.length !== 1 ? 's' : ''} (${active.length} active, ${stopped.length} stopped)\n`,
  );

  const printGroup = (label: string, list: typeof sessions) => {
    if (list.length === 0) return;
    console.log(`${label}:`);
    for (const s of list) {
      const name = s.name ?? s.shortId;
      const agent = s.agentType ? ` [${s.agentType}]` : '';
      const age = Math.floor((now - s.startedAt) / 1000);
      const ageStr = age < 60 ? `${age}s` : age < 3600 ? `${Math.floor(age / 60)}m` : `${Math.floor(age / 3600)}h`;
      const status = s.status === 'running' ? 'running' : 'stopped';
      console.log(`  ${String(name).padEnd(20)} ${ageStr.padEnd(6)} ago  ${status}${agent}  ${s.cwd ?? ''}`);
    }
    console.log('');
  };

  printGroup('Active', active);
  printGroup('Stopped', stopped);
}

export async function attachCommand(sessionId?: string): Promise<void> {
  if (!sessionId) {
    console.error('Usage: clew attach <session-id>');
    console.error('');
    console.error('Get session IDs with: clew agents list');
    process.exit(1);
  }

  const result = await attachSession(sessionId);
  if (!result.ok) {
    console.error(`Error: ${result.error}`);
    console.error('Get session IDs with: clew agents list');
    process.exit(1);
  }

  const data = result.data as any;
  console.log(`Session: ${data.name ?? getShortId(data.sessionId)}`);
  console.log(`  ID:     ${getShortId(data.sessionId)}`);
  console.log(`  PID:    ${data.pid}`);
  console.log(`  CWD:    ${data.cwd}`);
  console.log(`  Status: ${data.status}`);
  console.log(`  Running: ${data.isRunning ? 'yes' : 'no'}`);
  if (data.agentType) console.log(`  Agent:  ${data.agentType}`);
  if (data.prompt) console.log(`  Prompt: ${data.prompt}`);
  console.log('');
  if (!data.isRunning) {
    console.log(`Session is not running. Restart with: clew respawn ${getShortId(data.sessionId)}`);
  } else {
    console.log('Note: Full terminal attach requires the interactive TUI.');
    console.log('Open agent view with: clew agents');
  }
}

export async function logsCommand(sessionId?: string): Promise<void> {
  if (!sessionId) {
    console.error('Usage: clew logs <session-id>');
    process.exit(1);
  }

  const result = await getSessionLogs(sessionId);
  if (!result.ok) {
    console.error(`Error: ${result.error}`);
    process.exit(1);
  }

  const data = result.data as any;
  console.log(`Session: ${getShortId(data.sessionId)}`);
  console.log(`  Status: ${data.status}`);
  console.log(`  Running: ${data.isRunning ? 'yes' : 'no'}`);
  console.log('');
  if (data.logContent) {
    console.log(data.logContent);
  } else {
    console.log('(no output yet)');
  }
}

export async function stopCommand(sessionId?: string): Promise<void> {
  if (!sessionId) {
    console.error('Usage: clew stop <session-id>');
    process.exit(1);
  }

  const result = await stopSession(sessionId);
  if (!result.ok) {
    console.error(`Error: ${result.error}`);
    process.exit(1);
  }

  const data = result.data as any;
  console.log(`Stopped session: ${getShortId(data.sessionId)}`);
}

export async function respawnCommand(sessionId?: string, all?: boolean): Promise<void> {
  if (all) {
    const result = await respawnSession(undefined); // undefined = respawn all
    if (!result.ok) {
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }
    const data = result.data as any;
    console.log(`Respawning ${data.respawned} session${data.respawned !== 1 ? 's' : ''}...`);
    console.log('');
    console.log('Open agent view to re-attach: clew agents');
    return;
  }

  if (!sessionId) {
    console.error('Usage:');
    console.error('  clew respawn <session-id>      Restart a stopped session');
    console.error('  clew respawn --all             Restart all stopped sessions');
    process.exit(1);
  }

  const result = await respawnSession(sessionId);
  if (!result.ok) {
    console.error(`Error: ${result.error}`);
    process.exit(1);
  }

  const data = result.data as any;
  console.log(`Respawning session: ${getShortId(data.sessionId)} (pid ${data.pid})`);
  console.log('');
  console.log('Open agent view to re-attach: clew agents');
}

export async function rmCommand(sessionId?: string): Promise<void> {
  if (!sessionId) {
    console.error('Usage: clew rm <session-id>');
    console.error('');
    console.error('Removes a session from the list and cleans up its worktree.');
    console.error('This does NOT delete the conversation transcript — it stays on disk.');
    process.exit(1);
  }

  const result = await removeSession(sessionId);
  if (!result.ok) {
    console.error(`Error: ${result.error}`);
    process.exit(1);
  }

  const data = result.data as any;
  console.log(`Removed session: ${getShortId(data.removed)}`);
  console.log(`  Transcript preserved on disk.`);
}

export async function bgFlagHandler(
  prompt: string,
  agent?: string,
  model?: string,
  permissionMode?: string,
  options?: {
    name?: string;
    fallbackModel?: string;
    allowDangerouslySkipPermissions?: string;
    addDir?: string[];
    settings?: string;
    mcpConfig?: string;
    pluginDir?: string[];
    strictMcpConfig?: string;
  },
): Promise<string> {
  const sessionId = randomBytes(4).toString('hex');

  // Gate check: non-TTY
  if (!process.stdin.isTTY) {
    console.log('Background sessions require an interactive terminal. Use a TTY to start --bg sessions.');
    return sessionId;
  }
  const cwd = process.cwd();

  const sessionName = options?.name;
  console.log(`Starting background session${sessionName ? ` "${sessionName}"` : ''} in ${cwd}...`);

  // If no explicit permission mode, read from settings.json permissions.defaultMode
  if (!permissionMode) {
    const { getSettings_DEPRECATED } = await import('../utils/settings/settings.js');
    const settingsMode = getSettings_DEPRECATED()?.permissions?.defaultMode;
    if (settingsMode && typeof settingsMode === 'string') {
      permissionMode = settingsMode;
    }
  }

  const result = await startDaemonSession(sessionId, cwd, prompt, {
    agent,
    model,
    permissionMode,
    ...options,
  });

  if ('error' in result) {
    console.error(`Failed to start background session: ${result.error}`);
    // Fall back to direct registration (no daemon)
    console.log('');
    console.log(`backgrounded · ${sessionId}`);
    console.log('(Running in-process — daemon unavailable)');
    return sessionId;
  }

  console.log(`backgrounded · ${sessionId}`);
  console.log(`clew agents             list sessions`);
  console.log(`clew attach ${sessionId}          open in this terminal`);
  console.log(`clew logs ${sessionId}            show recent output`);
  console.log(`clew stop ${sessionId}            stop this session`);

  return sessionId;
}
