/**
 * IPC Client — Talks to the supervisor daemon over named pipe/Unix socket.
 *
 * Used by CLI commands (attach, logs, stop, respawn, rm, list) to communicate
 * with the background supervisor process.
 *
 * Auto-starts the supervisor if it's not running.
 */

import { spawn } from 'child_process';
import { createConnection } from 'net';
import { join } from 'path';
import { getClewConfigHomeDir } from '../../utils/envUtils.js';

const _DAEMON_DIR = join(getClewConfigHomeDir(), 'daemon');

const PIPE_NAME =
  process.platform === 'win32'
    ? `\\\\.\\pipe\\clew-supervisor-${process.env.USER ?? 'default'}`
    : `/tmp/clew-supervisor-${process.env.USER ?? 'default'}.sock`;

interface IPCRequest {
  type: string;
  sessionId?: string;
  cwd?: string;
  prompt?: string;
  agent?: string;
  model?: string;
  permissionMode?: string;
}

interface IPCResponse {
  ok: boolean;
  data?: unknown;
  error?: string;
}

function isSupervisorRunning(): Promise<boolean> {
  return new Promise(resolve => {
    const socket = createConnection(PIPE_NAME);
    socket.on('connect', () => {
      socket.end();
      resolve(true);
    });
    socket.on('error', () => {
      resolve(false);
    });
  });
}

async function startSupervisor(): Promise<boolean> {
  const supervisorScript = join(
    import.meta.dirname ?? process.cwd(),
    '..',
    '..',
    'services',
    'Supervisor',
    'supervisor.ts',
  );

  return new Promise(resolve => {
    const child = spawn(process.execPath, ['run', supervisorScript], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env },
    });
    child.unref();

    // Wait for supervisor to be ready (retry connection)
    let attempts = 0;
    const maxAttempts = 30; // 3 seconds max
    const tryConnect = () => {
      attempts++;
      const socket = createConnection(PIPE_NAME);
      socket.on('connect', () => {
        socket.end();
        resolve(true);
      });
      socket.on('error', () => {
        // BUG #3: Destroy failed socket before retrying to prevent resource leak
        socket.destroy();
        if (attempts < maxAttempts) {
          setTimeout(tryConnect, 100);
        } else {
          resolve(false);
        }
      });
    };
    setTimeout(tryConnect, 200); // Give it a moment to start listening
  });
}

export async function ensureSupervisor(): Promise<boolean> {
  if (await isSupervisorRunning()) return true;
  return startSupervisor();
}

export function sendRequest(request: IPCRequest, timeoutMs = 10000): Promise<IPCResponse> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(PIPE_NAME);
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Timeout waiting for supervisor response (${request.type})`));
    }, timeoutMs);

    let buffer = '';
    socket.on('data', (data: Buffer) => {
      buffer += data.toString();
      const newlineIdx = buffer.indexOf('\n');
      if (newlineIdx >= 0) {
        clearTimeout(timer);
        const line = buffer.slice(0, newlineIdx);
        socket.end();
        try {
          const response = JSON.parse(line) as IPCResponse;
          resolve(response);
        } catch (_e) {
          reject(new Error(`Invalid response from supervisor: ${line}`));
        }
      }
    });
    socket.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });
    socket.on('close', () => {
      clearTimeout(timer);
      // If we got no data, the connection was refused
      if (!buffer) {
        reject(new Error('Supervisor connection closed without response'));
      }
    });

    socket.write(`${JSON.stringify(request)}\n`);
  });
}

// ─── Public API ───────────────────────────────────────────────

export async function startDaemonSession(
  sessionId: string,
  cwd: string,
  prompt: string,
  options?: {
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
  },
): Promise<{ sessionId: string; pid: number } | { error: string }> {
  try {
    await ensureSupervisor();
    const response = await sendRequest({
      type: 'spawn',
      sessionId,
      cwd,
      prompt,
      agent: options?.agent,
      model: options?.model,
      permissionMode: options?.permissionMode,
      fallbackModel: options?.fallbackModel,
      allowDangerouslySkipPermissions: options?.allowDangerouslySkipPermissions,
      addDir: options?.addDir,
      settings: options?.settings,
      mcpConfig: options?.mcpConfig,
      pluginDir: options?.pluginDir,
      strictMcpConfig: options?.strictMcpConfig,
    });
    if (response.ok) {
      return response.data as { sessionId: string; pid: number };
    }
    return { error: response.error ?? 'Unknown error' };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function attachSession(sessionId: string): Promise<IPCResponse> {
  try {
    await ensureSupervisor();
    return sendRequest({ type: 'attach', sessionId });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function stopSession(sessionId: string): Promise<IPCResponse> {
  try {
    await ensureSupervisor();
    return sendRequest({ type: 'stop', sessionId });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function respawnSession(sessionId?: string): Promise<IPCResponse> {
  try {
    await ensureSupervisor();
    return sendRequest({ type: 'respawn', sessionId });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function removeSession(sessionId: string): Promise<IPCResponse> {
  try {
    await ensureSupervisor();
    return sendRequest({ type: 'rm', sessionId });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function listSessions(): Promise<IPCResponse> {
  try {
    await ensureSupervisor();
    return sendRequest({ type: 'list' });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export interface SessionLogsData {
  sessionId: string;
  status?: string;
  isRunning: boolean;
  pid?: number;
  logContent: string;
}

export async function getSessionLogs(sessionId: string): Promise<IPCResponse> {
  try {
    await ensureSupervisor();
    return sendRequest({ type: 'logs', sessionId });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function shutdownDaemon(): Promise<IPCResponse> {
  try {
    return sendRequest({ type: 'shutdown' }, 3000);
  } catch {
    return { ok: false, error: 'Supervisor not running' };
  }
}

export async function pingDaemon(): Promise<boolean> {
  try {
    const response = await sendRequest({ type: 'ping' }, 3000);
    return response.ok;
  } catch {
    return false;
  }
}

// ─── Autonomous Agent IPC ────────────────────────────────────

export async function autonomousStart(): Promise<IPCResponse> {
  try {
    await ensureSupervisor();
    return sendRequest({ type: 'autonomous_start' });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function autonomousStop(): Promise<IPCResponse> {
  try {
    await ensureSupervisor();
    return sendRequest({ type: 'autonomous_stop' });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function autonomousStatus(): Promise<IPCResponse> {
  try {
    await ensureSupervisor();
    return sendRequest({ type: 'autonomous_status' });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
