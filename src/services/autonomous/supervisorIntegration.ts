/**
 * Supervisor Integration — Hooks for the supervisor daemon to manage
 * the 24/7 autonomous agent (auto-start, health checks, auto-respawn).
 *
 * Safety: Auto-start is opt-in only. Default is disabled.
 * User must run `/daemon start` explicitly.
 */

import { type ChildProcess, spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js';
import { jsonParse } from '../../utils/slowOperations.js';
import { type AutonomousStatus, loadStatus } from './agentLoop.js';
import { getQueueStats, loadQueue } from './taskQueue.js';

// ─── Constants ────────────────────────────────────────────────

const DAEMON_DIR = join(getClaudeConfigHomeDir(), 'daemon');
const AUTONOMOUS_ENABLED_PATH = join(DAEMON_DIR, 'autonomous-enabled.json');

const HEALTH_CHECK_MS = 30_000; // check every 30s
const HEALTH_TIMEOUT_MS = 120_000; // consider dead after 2 min without heartbeat

// ─── State ────────────────────────────────────────────────────

let agentProcess: ChildProcess | null = null;
let healthInterval: ReturnType<typeof setInterval> | null = null;

// ─── Persistence ──────────────────────────────────────────────

interface AutonomousEnabled {
  enabled: boolean;
  updatedAt: number;
  autoStart: boolean; // auto-start on supervisor boot (default: false)
  projectRoot?: string;
}

export async function isAutonomousEnabled(): Promise<boolean> {
  try {
    if (existsSync(AUTONOMOUS_ENABLED_PATH)) {
      const raw = readFileSync(AUTONOMOUS_ENABLED_PATH, 'utf-8');
      const config = jsonParse(raw) as AutonomousEnabled;
      return config.enabled;
    }
  } catch {
    // file missing or corrupt
  }
  return false;
}

export async function isAutonomousAgentActive(): Promise<boolean> {
  try {
    const status = await loadStatus();
    if (status?.running) {
      const now = Date.now();
      const age = now - status.lastHeartbeat;
      // Heartbeat is updated every 60s in the loop. Allow up to 120s (2 min) before considering it stale.
      if (age < 120_000) {
        return true;
      }
    }
  } catch {
    // ignore
  }
  return false;
}

export async function isAutoStartEnabled(): Promise<boolean> {
  try {
    if (existsSync(AUTONOMOUS_ENABLED_PATH)) {
      const raw = readFileSync(AUTONOMOUS_ENABLED_PATH, 'utf-8');
      const config = jsonParse(raw) as AutonomousEnabled;
      return config.autoStart === true;
    }
  } catch {
    // file missing or corrupt
  }
  return false;
}

async function saveEnabledConfig(config: AutonomousEnabled): Promise<void> {
  await mkdir(DAEMON_DIR, { recursive: true });
  await writeFile(AUTONOMOUS_ENABLED_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

// ─── Agent Process Management ─────────────────────────────────

function getDaemonModeScript(): string {
  return join(import.meta.dirname ?? process.cwd(), 'daemonMode.ts');
}

export async function startAutonomousAgent(): Promise<boolean> {
  if (agentProcess && !agentProcess.killed) {
    console.log('[SupervisorIntegration] Autonomous agent already running');
    return true;
  }

  const script = getDaemonModeScript();
  console.log(`[SupervisorIntegration] Starting autonomous agent: ${script}`);

  try {
    agentProcess = spawn(process.execPath, ['run', script], {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        CLAUDE_CODE_AUTONOMOUS_MODE: '1',
        CLAUDE_CODE_DAEMON_MODE: '1',
      },
    });

    agentProcess.unref();

    if (agentProcess.stdout) {
      agentProcess.stdout.on('data', (data: Buffer) => {
        const lines = data.toString().trim().split('\n');
        for (const line of lines) {
          if (line.trim()) console.log(`[Autonomous] ${line.trim()}`);
        }
      });
    }
    if (agentProcess.stderr) {
      agentProcess.stderr.on('data', (data: Buffer) => {
        const lines = data.toString().trim().split('\n');
        for (const line of lines) {
          if (line.trim()) console.error(`[Autonomous:err] ${line.trim()}`);
        }
      });
    }

    agentProcess.on('exit', (code, signal) => {
      console.log(`[SupervisorIntegration] Autonomous agent exited (code: ${code}, signal: ${signal})`);
      agentProcess = null;

      // Auto-respawn only if enabled AND autoStart is on
      // (manual /daemon start sets both; auto-start from boot may set only autoStart)
      isAutoStartEnabled().then(autoStart => {
        if (autoStart && code !== 0) {
          console.log('[SupervisorIntegration] Auto-respawning autonomous agent (autoStart enabled)...');
          startAutonomousAgent();
        }
      });
    });

    agentProcess.on('error', err => {
      console.error(`[SupervisorIntegration] Autonomous agent error:`, err.message);
      agentProcess = null;
    });

    await saveEnabledConfig({
      enabled: true,
      updatedAt: Date.now(),
      autoStart: true,
      projectRoot: process.cwd(),
    });
    return true;
  } catch (err) {
    console.error('[SupervisorIntegration] Failed to start autonomous agent:', err);
    return false;
  }
}

export async function stopAutonomousAgent(): Promise<boolean> {
  if (agentProcess && !agentProcess.killed) {
    console.log('[SupervisorIntegration] Stopping autonomous agent...');
    agentProcess.kill('SIGTERM');

    // Wait up to 5s for graceful shutdown
    await new Promise<void>(resolve => {
      const timeout = setTimeout(() => {
        if (agentProcess && !agentProcess.killed) {
          console.log('[SupervisorIntegration] Force killing autonomous agent');
          agentProcess.kill('SIGKILL');
        }
        resolve();
      }, 5000);

      if (agentProcess) {
        agentProcess.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      } else {
        clearTimeout(timeout);
        resolve();
      }
    });

    agentProcess = null;
    // Save as disabled — user must explicitly start again
    await saveEnabledConfig({
      enabled: false,
      updatedAt: Date.now(),
      autoStart: false,
    });
    return true;
  }
  return false;
}

// ─── Health Checks ────────────────────────────────────────────

export async function checkHealth(): Promise<boolean> {
  if (!agentProcess || agentProcess.killed) return false;

  try {
    const killed = agentProcess.killed;
    if (killed) return false;
  } catch {
    return false;
  }

  const agentStatus = await loadStatus();
  if (!agentStatus) return false;

  const now = Date.now();
  const age = now - agentStatus.lastHeartbeat;

  if (age > HEALTH_TIMEOUT_MS) {
    console.log(`[SupervisorIntegration] Agent heartbeat stale (${Math.round(age / 1000)}s old)`);
    return false;
  }

  return true;
}

export function startHealthChecks(): void {
  if (healthInterval) return;

  healthInterval = setInterval(async () => {
    const enabled = await isAutonomousEnabled();
    if (!enabled) return;

    const healthy = await checkHealth();
    if (!healthy && agentProcess) {
      console.log('[SupervisorIntegration] Health check failed, respawning agent...');
      if (agentProcess && !agentProcess.killed) {
        agentProcess.kill('SIGKILL');
      }
      agentProcess = null;
      await startAutonomousAgent();
    }
  }, HEALTH_CHECK_MS);
}

export function stopHealthChecks(): void {
  if (healthInterval) {
    clearInterval(healthInterval);
    healthInterval = null;
  }
}

// ─── Auto-Start on Boot — OPT-IN ONLY ─────────────────────────

/**
 * Auto-start only if autoStart was explicitly enabled (user ran /daemon start
 * previously). Default is disabled.
 */
export async function autoStartIfEnabled(): Promise<void> {
  const autoStart = await isAutoStartEnabled();
  if (autoStart) {
    console.log('[SupervisorIntegration] Auto-starting autonomous agent (autoStart enabled)...');
    await startAutonomousAgent();
  } else {
    console.log('[SupervisorIntegration] Autonomous agent auto-start disabled (use /daemon start to enable)');
  }

  // Health checks only start if agent was started
  const enabled = await isAutonomousEnabled();
  if (enabled) {
    startHealthChecks();
  }
}

// ─── Status Query ─────────────────────────────────────────────

export async function getAutonomousStatus(): Promise<{
  enabled: boolean;
  running: boolean;
  autoStart: boolean;
  agent?: AutonomousStatus;
  tasks?: ReturnType<typeof getQueueStats>;
}> {
  const enabled = await isAutonomousEnabled();
  const autoStart = await isAutoStartEnabled();
  const running = agentProcess !== null && !agentProcess.killed;
  const agentStatus = await loadStatus();

  let taskStats;
  try {
    await loadQueue();
    taskStats = getQueueStats();
  } catch {
    // could not load
  }

  return {
    enabled,
    running,
    autoStart,
    agent: agentStatus ?? undefined,
    tasks: taskStats,
  };
}

export function isAgentProcessRunning(): boolean {
  return agentProcess !== null && !agentProcess.killed;
}
