/**
 * Supervisor Daemon — Background process that manages independent session processes.
 *
 * Architecture:
 * - One supervisor per user, auto-started on first background session
 * - Communicates via Windows named pipe or Unix socket
 * - Each background session is a child Bun process
 * - Roster persisted to ~/.clew/daemon/roster.json
 * - Auto-exits when all sessions finished and no terminal connected for ~1h
 *
 * IPC Protocol (JSON, newline-delimited over pipe/socket):
 *   Request:  {"type":"<command>","sessionId?":"...","cwd?":"...","prompt?":"..."}
 *   Response: {"ok":true,"data":{...}} or {"ok":false,"error":"..."}
 *
 * Commands: spawn, attach, stop, respawn, rm, list, logs, shutdown, ping
 */

import { type ChildProcess, spawn } from 'child_process';
import { randomBytes, randomUUID } from 'crypto';
import { mkdir, readFile, stat, unlink, writeFile } from 'fs/promises';
import { createServer, type Socket } from 'net';
import { join } from 'path';
import { getClewConfigHomeDir } from '../../utils/envUtils.js';
import { jsonParse } from '../../utils/slowOperations.js';
import {
  autoStartIfEnabled as autoStartAutonomous,
  getAutonomousStatus,
  startAutonomousAgent,
  startHealthChecks,
  stopAutonomousAgent,
} from '../autonomous/supervisorIntegration.js';

// ─── Constants ────────────────────────────────────────────────

const DAEMON_DIR = join(getClewConfigHomeDir(), 'daemon');
const ROSTER_PATH = join(DAEMON_DIR, 'roster.json');
const LOG_PATH = join(getClewConfigHomeDir(), 'daemon.log');

// Named pipe path (Windows) or Unix socket path
const PIPE_NAME =
  process.platform === 'win32'
    ? `\\\\.\\pipe\\clew-supervisor-${process.env.USER ?? 'default'}`
    : `/tmp/clew-supervisor-${process.env.USER ?? 'default'}.sock`;

// How long to wait before auto-exiting after last session finishes
const IDLE_EXIT_MS = 60 * 60 * 1000; // 1 hour

// How long to wait for a spawned session to become healthy before
// considering it unhealthy (milliseconds)
const SPAWN_HEALTH_TIMEOUT_MS = 5_000;

// Auto-retire sessions that have been idle (completed/stopped/failed)
// with no attached process for this duration
const IDLE_SESSION_RETIRE_MS = 5 * 60 * 1000; // 5 minutes

// ─── Types ────────────────────────────────────────────────────

interface SessionEntry {
  id: string;
  pid: number;
  cwd: string;
  startedAt: number;
  updatedAt: number;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  name?: string;
  agentType?: string;
  prompt?: string;
  worktreePath?: string;
  logPath?: string;
  model?: string;
  effortLevel?: string;
  permissionMode?: string;
  allowDangerouslySkipPermissions?: string;
}

interface RosterFile {
  version: 1;
  updatedAt: number;
  sessions: Record<string, SessionEntry>;
}

interface IPCRequest {
  type:
    | 'spawn'
    | 'attach'
    | 'stop'
    | 'respawn'
    | 'rm'
    | 'list'
    | 'logs'
    | 'shutdown'
    | 'ping'
    | 'autonomous_start'
    | 'autonomous_stop'
    | 'autonomous_status';
  sessionId?: string;
  cwd?: string;
  prompt?: string;
  agent?: string;
  model?: string;
  permissionMode?: string;
  fallbackModel?: string;
  allowDangerouslySkipPermissions?: string;
  addDir?: string[];
  settings?: string;
  mcpConfig?: string;
  pluginDir?: string[];
  strictMcpConfig?: string;
}

interface IPCResponse {
  ok: boolean;
  data?: unknown;
  error?: string;
}

// ─── State ────────────────────────────────────────────────────

let roster: RosterFile = { version: 1, updatedAt: Date.now(), sessions: {} };
const childProcesses = new Map<string, ChildProcess>();
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let connectedClients = 0;
let shuttingDown = false;

// ─── Persistence ──────────────────────────────────────────────

async function loadRoster(): Promise<void> {
  try {
    const raw = await readFile(ROSTER_PATH, 'utf-8');
    const parsed = jsonParse(raw) as RosterFile;
    if (parsed.version === 1 && parsed.sessions) {
      roster = parsed;
      log('Loaded roster:', Object.keys(roster.sessions).length, 'sessions');
    }
  } catch {
    log('No existing roster, starting fresh');
  }
}

async function saveRoster(): Promise<void> {
  roster.updatedAt = Date.now();
  await mkdir(DAEMON_DIR, { recursive: true });
  await writeFile(ROSTER_PATH, JSON.stringify(roster, null, 2), 'utf-8');
}

function log(...args: unknown[]): void {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}\n`;
  // Write to log file (best-effort)
  mkdir(DAEMON_DIR, { recursive: true })
    .then(() => {
      import('fs')
        .then(fs => {
          fs.appendFileSync(LOG_PATH, line);
        })
        .catch(() => {
          /* noop */
        });
    })
    .catch(() => {
      /* noop */
    });
}

// ─── Session Process Management ───────────────────────────────

function getSessionLogPath(sessionId: string): string {
  return join(DAEMON_DIR, 'jobs', sessionId, 'output.log');
}

function spawnSessionProcess(entry: SessionEntry): ChildProcess {
  const shortId = entry.id.slice(0, 8);
  log(`Spawning session ${shortId} in ${entry.cwd}`);

  const args: string[] = [];

  // Use the same entrypoint as the CLI
  const mainScript = join(import.meta.dirname ?? process.cwd(), '..', '..', 'main.tsx');

  args.push('run', mainScript, '-p');

  if (entry.prompt) {
    args.push(entry.prompt);
  }
  if (entry.agentType) {
    args.push('--agent', entry.agentType);
  }
  if (entry.model) {
    args.push('--model', entry.model);
  }
  if (entry.permissionMode) {
    args.push('--permission-mode', entry.permissionMode);
  }
  if (entry.allowDangerouslySkipPermissions === 'true') {
    args.push('--dangerously-skip-permissions');
  }
  // Generate a proper UUID for the spawned session (CLI requires UUID format
  // for --session-id). The entry.id stored in the roster is a short hex ID;
  // the UUID maps the process to a trackable session for attach/logs.
  const sessionUuid = randomUUID();
  args.push('--session-id', sessionUuid);

  // Ensure log directory exists
  const logDir = join(DAEMON_DIR, 'jobs', entry.id);
  mkdir(logDir, { recursive: true }).catch(() => {
    /* noop */
  });

  const child = spawn(process.execPath, args, {
    cwd: entry.cwd,
    env: {
      ...process.env,
      CLEW_CODE_DAEMON_SESSION_ID: entry.id,
      CLEW_CODE_DAEMON_MODE: '1',
    },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.unref();

  // Capture output to log
  if (child.stdout) {
    import('fs')
      .then(fs => {
        const logStream = fs.createWriteStream(entry.logPath!, { flags: 'a' });
        child.stdout!.pipe(logStream);
      })
      .catch(() => {
        /* noop */
      });
  }
  if (child.stderr) {
    import('fs')
      .then(fs => {
        const logStream = fs.createWriteStream(entry.logPath!, { flags: 'a' });
        child.stderr!.pipe(logStream);
      })
      .catch(() => {
        /* noop */
      });
  }

  // Health check: if the process exits very soon after spawn (before the
  // health timeout), it was unhealthy.
  const healthTimer = setTimeout(() => {
    // Process survived long enough — consider it healthy
  }, SPAWN_HEALTH_TIMEOUT_MS);

  // BUG #24: Combine exit handlers into single .once() to prevent double state modification
  child.once('exit', code => {
    clearTimeout(healthTimer);
    log(`Session ${shortId} process exited with code ${code}`);
    const session = roster.sessions[entry.id];
    if (session) {
      // Check health: if exited early, mark as failed regardless of exit code
      const exitedEarly = code !== null && Date.now() - entry.startedAt < SPAWN_HEALTH_TIMEOUT_MS;
      if (exitedEarly) {
        log(`Session ${shortId} exited early (code ${code}) — marking as failed for health fallback`);
        session.status = 'failed';
      } else {
        session.status = code === 0 ? 'completed' : 'failed';
      }
      session.updatedAt = Date.now();
      saveRoster();
    }
    childProcesses.delete(entry.id);
    checkIdleExit();
  });

  child.on('error', err => {
    log(`Session ${shortId} process error:`, err.message);
    const session = roster.sessions[entry.id];
    if (session) {
      session.status = 'failed';
      session.updatedAt = Date.now();
      saveRoster();
    }
    childProcesses.delete(entry.id);
    checkIdleExit();
  });

  return child;
}

// ─── IPC Command Handlers ─────────────────────────────────────

function handleSpawn(req: IPCRequest): IPCResponse {
  if (!req.sessionId) return { ok: false, error: 'Missing sessionId' };
  if (!req.cwd) return { ok: false, error: 'Missing cwd' };

  const shortId = randomBytes(4).toString('hex');
  const sessionId = req.sessionId || shortId;
  const entry: SessionEntry = {
    id: sessionId,
    pid: 0,
    cwd: req.cwd,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    status: 'running',
    name: req.prompt?.slice(0, 40),
    agentType: req.agent,
    prompt: req.prompt,
    model: req.model,
    permissionMode: req.permissionMode,
    allowDangerouslySkipPermissions: req.allowDangerouslySkipPermissions,
    logPath: getSessionLogPath(sessionId),
  };

  roster.sessions[sessionId] = entry;
  saveRoster();

  const child = spawnSessionProcess(entry);
  entry.pid = child.pid ?? 0;
  childProcesses.set(sessionId, child);
  saveRoster();

  // Reset idle timer
  resetIdleTimer();

  log(`Spawned session ${sessionId.slice(0, 8)} (pid ${entry.pid})`);
  return { ok: true, data: { sessionId, pid: entry.pid } };
}

function handleAttach(req: IPCRequest): IPCResponse {
  if (!req.sessionId) return { ok: false, error: 'Missing sessionId' };

  const entry = roster.sessions[req.sessionId];
  if (!entry) return { ok: false, error: `Session not found: ${req.sessionId}` };

  const child = childProcesses.get(req.sessionId);
  const isRunning = child && !child.killed && child.exitCode === null;

  return {
    ok: true,
    data: {
      sessionId: entry.id,
      pid: entry.pid,
      cwd: entry.cwd,
      status: entry.status,
      isRunning,
      name: entry.name,
      agentType: entry.agentType,
      prompt: entry.prompt,
      logPath: entry.logPath,
      startedAt: entry.startedAt,
    },
  };
}

function handleStop(req: IPCRequest): IPCResponse {
  if (!req.sessionId) return { ok: false, error: 'Missing sessionId' };

  const child = childProcesses.get(req.sessionId);
  if (child && !child.killed) {
    child.kill('SIGTERM');
    log(`Sent SIGTERM to session ${req.sessionId.slice(0, 8)}`);
  }

  const entry = roster.sessions[req.sessionId];
  if (entry) {
    entry.status = 'stopped';
    entry.updatedAt = Date.now();
  }
  saveRoster();
  checkIdleExit();

  return { ok: true, data: { sessionId: req.sessionId, status: 'stopped' } };
}

function handleRespawn(req: IPCRequest): IPCResponse {
  if (req.type === 'respawn' && !req.sessionId) {
    // respawn --all: restart all stopped sessions
    const respawned: string[] = [];
    for (const [id, entry] of Object.entries(roster.sessions)) {
      if (entry.status === 'stopped' || entry.status === 'failed') {
        entry.status = 'running';
        entry.updatedAt = Date.now();
        const child = spawnSessionProcess(entry);
        entry.pid = child.pid ?? 0;
        childProcesses.set(id, child);
        respawned.push(id);
      }
    }
    saveRoster();
    if (respawned.length > 0) resetIdleTimer();
    return { ok: true, data: { respawned: respawned.length, sessions: respawned } };
  }

  if (!req.sessionId) return { ok: false, error: 'Missing sessionId' };

  const entry = roster.sessions[req.sessionId];
  if (!entry) return { ok: false, error: `Session not found: ${req.sessionId}` };

  // Kill existing if running
  const existing = childProcesses.get(req.sessionId);
  if (existing && !existing.killed) {
    existing.kill('SIGTERM');
  }

  entry.status = 'running';
  entry.updatedAt = Date.now();
  const child = spawnSessionProcess(entry);
  entry.pid = child.pid ?? 0;
  childProcesses.set(req.sessionId, child);
  saveRoster();
  resetIdleTimer();

  return { ok: true, data: { sessionId: entry.id, pid: entry.pid } };
}

function handleRm(req: IPCRequest): IPCResponse {
  if (!req.sessionId) return { ok: false, error: 'Missing sessionId' };

  // Stop process first
  const child = childProcesses.get(req.sessionId);
  if (child && !child.killed) {
    child.kill('SIGTERM');
    childProcesses.delete(req.sessionId);
  }

  const entry = roster.sessions[req.sessionId];
  delete roster.sessions[req.sessionId];
  saveRoster();

  // Clean up log directory and transcript file
  if (entry?.logPath) {
    const logDir = join(DAEMON_DIR, 'jobs', req.sessionId);
    import('fs/promises')
      .then(fs => {
        fs.rm(logDir, { recursive: true, force: true }).catch(() => {
          /* noop */
        });
      })
      .catch(() => {
        /* noop */
      });
  }

  // Remove transcript file so deleting from agent view also cleans up transcripts.
  if (entry?.logPath) {
    const projectDir = join(DAEMON_DIR, 'projects', entry.cwd ? entry.cwd.replace(/[\\/:*?"<>|]/g, '_') : 'default');
    const transcriptPath = join(projectDir, `${req.sessionId}.jsonl`);
    import('fs/promises')
      .then(fs => {
        fs.rm(transcriptPath, { force: true }).catch(() => {
          /* noop */
        });
      })
      .catch(() => {
        /* noop */
      });
  }

  log(`Removed session ${req.sessionId.slice(0, 8)}`);
  checkIdleExit();
  return { ok: true, data: { removed: req.sessionId } };
}

function handleList(): IPCResponse {
  const sessions = Object.entries(roster.sessions).map(([id, entry]) => {
    const child = childProcesses.get(id);
    const isRunning = child && !child.killed && child.exitCode === null;
    return {
      id,
      shortId: id.slice(0, 8),
      pid: entry.pid,
      cwd: entry.cwd,
      status: isRunning ? ('running' as const) : entry.status,
      name: entry.name,
      agentType: entry.agentType,
      startedAt: entry.startedAt,
      updatedAt: entry.updatedAt,
    };
  });

  return {
    ok: true,
    data: {
      sessions,
      total: sessions.length,
      running: sessions.filter(s => s.status === 'running').length,
    },
  };
}

async function handleLogs(req: IPCRequest): Promise<IPCResponse> {
  if (!req.sessionId) return { ok: false, error: 'Missing sessionId' };

  const entry = roster.sessions[req.sessionId];
  if (!entry) return { ok: false, error: `Session not found: ${req.sessionId}` };

  // Read recent log output synchronously (fs.readFileSync is available in Bun)
  let logContent = '';
  if (entry.logPath) {
    try {
      const fs = await import('fs');
      logContent = fs.readFileSync(entry.logPath, 'utf-8').slice(-10000); // last 10KB
    } catch {
      logContent = '(log not available)';
    }
  }

  const child = childProcesses.get(req.sessionId);
  const isRunning = child && !child.killed && child.exitCode === null;

  return {
    ok: true,
    data: {
      sessionId: entry.id,
      status: entry.status,
      isRunning,
      pid: entry.pid,
      logContent: logContent || '(no output yet)',
    },
  };
}

function handleShutdown(): IPCResponse {
  log('Shutting down supervisor...');
  shuttingDown = true;

  // Kill all child processes
  for (const [id, child] of childProcesses) {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
    childProcesses.delete(id);
  }

  saveRoster();

  // Schedule exit
  setTimeout(() => {
    process.exit(0);
  }, 500);

  return { ok: true, data: { message: 'Supervisor shutting down' } };
}

// ─── Idle Exit ────────────────────────────────────────────────

function resetIdleTimer(): void {
  if (idleTimer) clearTimeout(idleTimer);

  idleTimer = setTimeout(() => {
    const runningSessions = Object.values(roster.sessions).filter(s => s.status === 'running');
    if (runningSessions.length === 0) {
      log('No running sessions and idle for 1h. Exiting.');
      server.close();
      process.exit(0);
    }
  }, IDLE_EXIT_MS);
}

function checkIdleExit(): void {
  const runningSessions = Object.values(roster.sessions).filter(s => s.status === 'running');
  if (runningSessions.length === 0 && connectedClients === 0) {
    // Still wait for idle timeout before exiting
    if (!idleTimer) resetIdleTimer();
  } else {
    resetIdleTimer();
  }
}

// ─── IPC Server ───────────────────────────────────────────────

function sendResponse(socket: Socket, response: IPCResponse): void {
  socket.write(`${JSON.stringify(response)}\n`);
}

function handleRequest(socket: Socket, request: IPCRequest): void {
  log('IPC request:', request.type, request.sessionId?.slice(0, 8) ?? '');

  const respond = (response: IPCResponse) => sendResponse(socket, response);

  switch (request.type) {
    case 'ping':
      respond({ ok: true, data: { sessions: Object.keys(roster.sessions).length } });
      break;
    case 'spawn':
      respond(handleSpawn(request));
      break;
    case 'attach':
      respond(handleAttach(request));
      break;
    case 'stop':
      respond(handleStop(request));
      break;
    case 'respawn':
      respond(handleRespawn(request));
      break;
    case 'rm':
      respond(handleRm(request));
      break;
    case 'list':
      respond(handleList());
      break;
    case 'logs':
      // handleLogs is async (reads from disk)
      handleLogs(request)
        .then(respond)
        .catch(err => respond({ ok: false, error: err.message }));
      return; // Don't respond synchronously
    case 'shutdown':
      respond(handleShutdown());
      break;
    case 'autonomous_start':
      startAutonomousAgent()
        .then(ok => respond({ ok, data: { started: ok } }))
        .catch(err => respond({ ok: false, error: err.message }));
      return;
    case 'autonomous_stop':
      stopAutonomousAgent()
        .then(ok => respond({ ok, data: { stopped: ok } }))
        .catch(err => respond({ ok: false, error: err.message }));
      return;
    case 'autonomous_status':
      getAutonomousStatus()
        .then(data => respond({ ok: true, data }))
        .catch(err => respond({ ok: false, error: err.message }));
      return;
    default:
      respond({ ok: false, error: `Unknown command: ${(request as any).type}` });
  }
}

function onClientConnect(socket: Socket): void {
  connectedClients++;
  log(`Client connected (${connectedClients} connected)`);
  resetIdleTimer();

  let buffer = '';

  socket.on('data', (data: Buffer) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const request = jsonParse(line) as IPCRequest;
        handleRequest(socket, request);
      } catch (e) {
        sendResponse(socket, { ok: false, error: `Invalid JSON: ${(e as Error).message}` });
      }
    }
  });

  socket.on('close', () => {
    connectedClients--;
    log(`Client disconnected (${connectedClients} connected)`);
    checkIdleExit();
  });

  socket.on('error', err => {
    log('Socket error:', err.message);
  });
}

// Clean up stale pipe file on startup
async function cleanupPipeFile(): Promise<void> {
  if (process.platform !== 'win32') {
    try {
      await unlink(PIPE_NAME);
    } catch {
      // Pipe file doesn't exist, that's fine
    }
  }
}

// ─── Server ───────────────────────────────────────────────────

let server: ReturnType<typeof createServer>;

// ─── Startup ──────────────────────────────────────────────────

async function start(): Promise<void> {
  log('=== Supervisor starting ===');
  log('PID:', process.pid);
  log('Config dir:', getClewConfigHomeDir());
  log('Pipe:', PIPE_NAME);

  await loadRoster();
  await cleanupPipeFile();

  // Check if we can resume any existing sessions (recover after upgrade)
  for (const [_id, entry] of Object.entries(roster.sessions)) {
    if (entry.status === 'running') {
      // Mark as stopped since this is a fresh supervisor
      entry.status = 'stopped';
      entry.updatedAt = Date.now();
    }
  }
  await saveRoster();

  server = createServer(onClientConnect).on('error', (err: Error) => {
    log('Server error:', err.message);
    process.exit(1);
  });

  server.listen(PIPE_NAME, () => {
    log('=== Supervisor ready ===');
    // Write PID file for discovery
    mkdir(DAEMON_DIR, { recursive: true })
      .then(() => {
        writeFile(join(DAEMON_DIR, 'supervisor.pid'), String(process.pid), 'utf-8').catch(() => {
          /* noop */
        });
      })
      .catch(() => {
        /* noop */
      });
  });

  // Start idle timer
  checkIdleExit();

  // Auto-start 24/7 autonomous agent if enabled
  autoStartAutonomous().then(() => {
    startHealthChecks();
    log('Autonomous 24/7 agent health checks started');
  });

  // Detect binary upgrades (brew upgrade, etc.). When process.execPath is
  // replaced, the daemon is running a stale binary — future spawns may use
  // the new binary (breaking IPC) or the old path may be deleted (ENOENT).
  // Check inode/mtime every 5 minutes and exit gracefully if changed.
  const BINARY_CHECK_INTERVAL_MS = 5 * 60 * 1000;
  let _binaryUpgradeCheck: ReturnType<typeof setInterval> | undefined;
  try {
    const initialStat = await stat(process.execPath);
    _binaryUpgradeCheck = setInterval(async () => {
      try {
        const currentStat = await stat(process.execPath);
        const changed = currentStat.ino !== initialStat.ino || currentStat.mtimeMs !== initialStat.mtimeMs;
        if (changed && !shuttingDown) {
          log(`Binary at ${process.execPath} has been upgraded (ino/mtime changed). Exiting gracefully.`);
          server.close();
          process.exit(0);
        }
      } catch {
        // ENOENT means the binary was deleted — still treat as upgrade
        if (!shuttingDown) {
          log(`Binary at ${process.execPath} no longer exists (upgraded/deleted). Exiting gracefully.`);
          server.close();
          process.exit(0);
        }
      }
    }, BINARY_CHECK_INTERVAL_MS);
  } catch {
    log('Could not stat binary path, skipping binary upgrade detection');
  }

  // Periodically retire idle (completed/stopped/failed) sessions that
  // have no running process and have been idle for >5 minutes.
  // Cleans up empty placeholder sessions left over from ← on fresh REPL.
  setInterval(() => {
    const now = Date.now();
    let retired = 0;
    for (const [id, entry] of Object.entries(roster.sessions)) {
      if (entry.status === 'running') continue;
      const child = childProcesses.get(id);
      if (child && !child.killed && child.exitCode === null) continue;
      if (now - entry.updatedAt > IDLE_SESSION_RETIRE_MS) {
        delete roster.sessions[id];
        childProcesses.delete(id);
        retired++;
        log(
          `Retired idle session ${id.slice(0, 8)} (${entry.status}, idle ${Math.round((now - entry.updatedAt) / 1000)}s)`,
        );
      }
    }
    if (retired > 0) {
      saveRoster();
      log(`Retired ${retired} idle session(s)`);
    }
  }, IDLE_SESSION_RETIRE_MS);

  // Handle process signals
  process.on('SIGTERM', () => {
    log('Received SIGTERM, shutting down...');
    shuttingDown = true;
    // Stop autonomous agent first
    stopAutonomousAgent().catch(() => {
      /* noop */
    });
    for (const [_id, child] of childProcesses) {
      if (!child.killed) {
        child.kill('SIGTERM');
      }
    }
    saveRoster().then(() => {
      server.close();
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    // Supervisor ignores Ctrl+C; only sessions should handle it
    log('Ignoring SIGINT (Ctrl+C) at supervisor level');
  });
}

// ─── Entry Point ──────────────────────────────────────────────

// Check if we're already running
async function isAlreadyRunning(): Promise<boolean> {
  try {
    const pidPath = join(DAEMON_DIR, 'supervisor.pid');
    const pidStr = await readFile(pidPath, 'utf-8');
    const pid = parseInt(pidStr.trim(), 10);
    if (Number.isNaN(pid)) return false;

    // Check if process is still running
    try {
      process.kill(pid, 0); // Signal 0 = check existence
      return true;
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}

// Only start if run as main
const isMainModule = process.argv[1]?.includes('supervisor');

if (isMainModule) {
  start().catch(err => {
    log('Fatal error:', err.message);
    process.exit(1);
  });
}

export { DAEMON_DIR, isAlreadyRunning, PIPE_NAME, start };
