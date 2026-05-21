/**
 * Autonomous Agent Loop — the "brain" that runs 24/7 in the background.
 *
 * Continuously checks the task queue, spawns worker sessions for each task,
 * monitors execution, and retries on failure.
 *
 * Runs as a child process managed by the Supervisor daemon.
 *
 * Safety features:
 * - Uses task lease/lock to prevent duplicate execution
 * - Respects dead-letter status (stops infinite retry)
 * - Uses sanitized prompt builder with injection boundary
 * - Graceful shutdown sequence
 */

import { existsSync, readFileSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js';
import { jsonParse } from '../../utils/slowOperations.js';
import {
  type TaskQueueEntry,
  buildWorkerPrompt,
  expireLeases,
  getNextTask,
  leaseTask,
  loadQueue,
  markTaskCompleted,
  markTaskFailed,
  releaseLease,
  retryTask,
  saveQueue,
  watchQueue,
  closeWatcher as closeQueueWatcher,
} from './taskQueue.js';
import { ensureSupervisor, sendRequest } from '../Supervisor/ipcClient.js';

// ─── Constants ────────────────────────────────────────────────

const DAEMON_DIR = join(getClaudeConfigHomeDir(), 'daemon');
const STATUS_PATH = join(DAEMON_DIR, 'autonomous.json');
const LOOP_SLEEP_MS = 15_000;          // 15s between queue checks when idle
const WORKER_POLL_MS = 5_000;           // 5s between worker status checks
const MAX_CONCURRENT_WORKERS = 3;
const TASK_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes max per task
const STARTUP_LEASE_EXPIRE_MS = 2_000;  // Wait 2s on start for lease expiry

// ─── Types ────────────────────────────────────────────────────

export interface AutonomousStatus {
  running: boolean;
  startedAt: number;
  currentTaskId?: string;
  currentTaskTitle?: string;
  workerSessionId?: string;
  workerPid?: number;
  workerStatus?: 'spawning' | 'running' | 'completed' | 'failed';
  lastHeartbeat: number;
  tasksProcessed: number;
  tasksFailed: number;
  tasksDeadLettered: number;
  uptime: number;
  /** ISO timestamp string of last error */
  lastError?: string;
  /** Error message if loop crashed */
  lastErrorMessage?: string;
}

interface WorkerSession {
  sessionId: string;
  taskId: string;
  pid: number;
}

// ─── Agent Identity ───────────────────────────────────────────

const AGENT_ID = `daemon-${process.pid}-${Date.now().toString(36)}`;

// ─── State ────────────────────────────────────────────────────

let status: AutonomousStatus = {
  running: false,
  startedAt: 0,
  lastHeartbeat: 0,
  tasksProcessed: 0,
  tasksFailed: 0,
  tasksDeadLettered: 0,
  uptime: 0,
};

let running = false;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let activeWorkers: Map<string, WorkerSession> = new Map();

// ─── Status Persistence ───────────────────────────────────────

export async function loadStatus(): Promise<AutonomousStatus | null> {
  try {
    if (existsSync(STATUS_PATH)) {
      const raw = readFileSync(STATUS_PATH, 'utf-8');
      return jsonParse(raw) as AutonomousStatus;
    }
  } catch {
    // corrupt or missing
  }
  return null;
}

export async function saveStatus(): Promise<void> {
  status.lastHeartbeat = Date.now();
  status.uptime = status.running ? Date.now() - status.startedAt : 0;
  await mkdir(DAEMON_DIR, { recursive: true });
  await writeFile(STATUS_PATH, JSON.stringify(status, null, 2), 'utf-8');
}

function updateStatus(partial: Partial<AutonomousStatus>): void {
  Object.assign(status, partial);
  saveStatus().catch(() => {});
}

// ─── Worker Spawning ──────────────────────────────────────────

async function spawnWorker(task: TaskQueueEntry): Promise<WorkerSession | null> {
  const workerPrompt = buildWorkerPrompt(task);

  try {
    await ensureSupervisor();
    const response = await sendRequest({
      type: 'spawn',
      prompt: workerPrompt,
      cwd: task.projectRoot ?? process.cwd(),
      agent: 'worker-24-7',
      sessionId: `task-${task.id}`,
      permissionMode: 'bypassPermissions',
    });

    if (response.ok) {
      const data = response.data as { sessionId: string; pid: number };
      const worker: WorkerSession = {
        sessionId: data.sessionId,
        taskId: task.id,
        pid: data.pid,
      };
      activeWorkers.set(task.id, worker);
      return worker;
    }
  } catch (err) {
    console.error(`[Autonomous] Failed to spawn worker for task ${task.id}:`, err);
  }
  return null;
}

/**
 * Check on a worker's status via the supervisor IPC.
 */
async function checkWorker(worker: WorkerSession): Promise<'running' | 'completed' | 'failed' | 'unknown'> {
  try {
    const response = await sendRequest({ type: 'attach', sessionId: worker.sessionId });
    if (response.ok) {
      const data = response.data as { status: string; isRunning: boolean };
      if (data.isRunning) return 'running';
      if (data.status === 'completed') return 'completed';
      if (data.status === 'failed') return 'failed';
      return 'completed';
    }
  } catch {
    // Supervisor might be restarting
  }
  return 'unknown';
}

/**
 * Stop a worker session.
 */
async function stopWorker(worker: WorkerSession): Promise<void> {
  try {
    await sendRequest({ type: 'stop', sessionId: worker.sessionId });
  } catch {
    // best-effort
  }
  activeWorkers.delete(worker.taskId);
}

// ─── Core Loop ────────────────────────────────────────────────

async function processTask(task: TaskQueueEntry): Promise<void> {
  console.log(`[Autonomous] Starting task: ${task.title} (${task.id})`);
  updateStatus({
    currentTaskId: task.id,
    currentTaskTitle: task.title,
    workerStatus: 'spawning',
  });

  // Acquire lease first — prevents duplicate execution
  const leased = await leaseTask(task.id, AGENT_ID);
  if (!leased) {
    console.log(`[Autonomous] Could not acquire lease for ${task.id}, skipping`);
    updateStatus({ currentTaskId: undefined, currentTaskTitle: undefined, workerStatus: undefined });
    return;
  }

  // Spawn worker
  const worker = await spawnWorker(task);
  if (!worker) {
    console.error(`[Autonomous] Failed to spawn worker for task ${task.id}`);
    await releaseLease(task.id, AGENT_ID);
    const retryResult = await retryTask(task.id);
    if (retryResult === 'dead_letter') {
      console.log(`[Autonomous] Task ${task.id} moved to dead-letter (spawn failed, max retries exceeded)`);
      updateStatus({ tasksDeadLettered: status.tasksDeadLettered + 1 });
    } else if (!retryResult) {
      await markTaskFailed(task.id, 'Failed to spawn worker session');
      updateStatus({ tasksFailed: status.tasksFailed + 1 });
    }
    updateStatus({ currentTaskId: undefined, currentTaskTitle: undefined, workerStatus: undefined });
    return;
  }

  console.log(`[Autonomous] Worker spawned: ${worker.sessionId} (pid ${worker.pid})`);
  updateStatus({
    workerSessionId: worker.sessionId,
    workerPid: worker.pid,
    workerStatus: 'running',
  });

  // Monitor worker until done
  const startTime = Date.now();
  let lastStatus: string | undefined;
  let completed = false;
  let failed = false;

  while (running) {
    // Check timeout
    if (Date.now() - startTime > TASK_TIMEOUT_MS) {
      console.log(`[Autonomous] Task ${task.id} timed out after 30m`);
      await stopWorker(worker);
      await releaseLease(task.id, AGENT_ID);
      failed = true;
      break;
    }

    const workerStatus = await checkWorker(worker);
    if (workerStatus !== lastStatus) {
      console.log(`[Autonomous] Worker status for ${task.id}: ${workerStatus}`);
      lastStatus = workerStatus;
    }

    if (workerStatus === 'completed') {
      await releaseLease(task.id, AGENT_ID);
      await markTaskCompleted(task.id);
      updateStatus({ tasksProcessed: status.tasksProcessed + 1 });
      completed = true;
      break;
    }

    if (workerStatus === 'failed') {
      await stopWorker(worker);
      await releaseLease(task.id, AGENT_ID);
      failed = true;
      break;
    }

    // Sleep before next poll
    await sleep(WORKER_POLL_MS);
  }

  // Handle failure with dead-letter aware retry
  if (failed) {
    await markTaskFailed(task.id, 'Worker failed');
    const retryResult = await retryTask(task.id);
    if (retryResult === 'dead_letter') {
      console.log(`[Autonomous] Task ${task.id} moved to dead-letter (max retries)`);
      updateStatus({ tasksDeadLettered: status.tasksDeadLettered + 1 });
    } else if (retryResult === 'pending') {
      const taskState = (await import('./taskQueue.js')).getTask(task.id);
      const waitSec = taskState?.retryAfter ? Math.round((taskState.retryAfter - Date.now()) / 1000) : 30;
      console.log(`[Autonomous] Task ${task.id} will retry in ~${waitSec}s (backoff)`);
    } else {
      updateStatus({ tasksFailed: status.tasksFailed + 1 });
    }
  }

  // Cleanup
  activeWorkers.delete(task.id);
  updateStatus({
    currentTaskId: undefined,
    currentTaskTitle: undefined,
    workerSessionId: undefined,
    workerPid: undefined,
    workerStatus: undefined,
  });
}

// ─── Public API ───────────────────────────────────────────────

export async function startLoop(): Promise<void> {
  if (running) return;

  await loadQueue();
  running = true;
  status.running = true;
  status.startedAt = Date.now();
  status.lastHeartbeat = Date.now();
  status.lastError = undefined;
  status.lastErrorMessage = undefined;

  // Expire stale leases from previous runs
  await sleep(STARTUP_LEASE_EXPIRE_MS);
  const expired = await expireLeases();
  if (expired > 0) {
    console.log(`[Autonomous] Expired ${expired} stale lease(s) from previous run`);
  }

  // Start heartbeat
  heartbeatInterval = setInterval(() => {
    saveStatus().catch(() => {});
  }, 60_000);

  await saveStatus();
  console.log('[Autonomous] Agent loop started');

  // Watch task queue for live updates
  watchQueue(() => {
    // Queue changed, loop will pick up changes on next iteration
  });

  // Main loop
  while (running) {
    try {
      const task = getNextTask();
      if (task) {
        if (activeWorkers.size >= MAX_CONCURRENT_WORKERS) {
          await sleep(LOOP_SLEEP_MS);
          continue;
        }
        await processTask(task);
      } else {
        await sleep(LOOP_SLEEP_MS);
      }
    } catch (err) {
      const msg = (err as Error).message;
      console.error('[Autonomous] Loop error:', msg);
      updateStatus({
        lastError: new Date().toISOString(),
        lastErrorMessage: msg,
      });
      await sleep(LOOP_SLEEP_MS);
    }
  }
}

export async function stopLoop(): Promise<void> {
  console.log('[Autonomous] Stopping agent loop...');
  running = false;
  status.running = false;

  // Release leases for active workers
  for (const [taskId, worker] of activeWorkers) {
    console.log(`[Autonomous] Stopping worker for task ${taskId}`);
    await releaseLease(taskId, AGENT_ID);
    await stopWorker(worker);
  }
  activeWorkers.clear();

  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }

  // Close file watcher
  closeQueueWatcher();

  await saveStatus();
  console.log('[Autonomous] Agent loop stopped');
}

export function getLoopStatus(): AutonomousStatus {
  return { ...status };
}

export function isLoopRunning(): boolean {
  return running;
}

// ─── Utilities ────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
