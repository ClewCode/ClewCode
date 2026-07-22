/**
 * PeerServer — Lightweight HTTP + WebSocket server for agent-to-agent communication.
 *
 * Each peer that runs "/peer share" starts a PeerServer on a random port.
 * - GET /peer-info → JSON with current peer info
 * - POST /peer-msg → accept message from another peer (triggers callback)
 * - POST /peer-todo → accept todo from another peer
 * - POST /peer-exec → execute a command (or queue it if busy)
 * - GET /peer-queue-status → current queue state
 * - POST /peer-queue-cancel → cancel a queued task
 * - POST /peer-queue-cancel-all → cancel all queued tasks
 * - POST /broker/send     → send a message to the broker queue
 * - GET /broker/recv      → long-poll for messages from the broker
 * - POST /broker/reply    → reply to a broker message
 * - WebSocket /peer-chat → real-time chat between two peers
 */

import { randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { logForDebugging } from '../utils/debug.js';
import { errorMessage } from '../utils/errors.js';
import { createAgentWorktree, removeAgentWorktree } from '../utils/worktree.js';
import { getGlobalPeerStore } from './PeerStore.js';
import {
  flushPeerTasksSave,
  loadPeerTasks,
  type PersistedSwarmTasks,
  schedulePeerTasksSave,
} from './peerPersistence.js';
import {
  type BrokerMessage,
  type MeshChatMessage,
  type MeshTaskPriority,
  type MeshTodo,
  type PeerInfo,
  peerColorFromId,
  type SwarmTask,
} from './types.js';

export type PeerServerCallbacks = {
  onMessage?: (msg: MeshChatMessage) => void;
  onTodo?: (todo: MeshTodo) => void;
  /** cwd is the task's isolated worktree path when worktree isolation is enabled. */
  onExec?: (command: string, cwd?: string) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  /** Called when a queued task starts or completes */
  onQueueUpdate?: (queue: SwarmTask[], currentTask: SwarmTask | null) => void;
};

type PeerServerOptions = {
  /** How many tasks this server executes at once. Default 1 (matches legacy behavior). */
  maxConcurrentTasks?: number;
  /**
   * Run each task's shell command inside its own isolated git worktree
   * (via createAgentWorktree/removeAgentWorktree) instead of the server's
   * own cwd. Prevents concurrent/queued swarm tasks from stepping on files
   * an interactive session (or another task) is using. Default false —
   * callers that want isolation (the production singleton) opt in explicitly
   * so unit tests constructing a bare PeerServer never trigger real git
   * worktree creation.
   */
  isolateWorktrees?: boolean;
  /** Persist the task queue to disk so it survives restarts. Default false. */
  persist?: boolean;
};

type MeshEventType = 'new_message' | 'new_todo' | 'swarm_online' | 'swarm_offline' | 'queue_update';

type MeshEvent = {
  type: MeshEventType;
  data: any;
  timestamp: number;
};

/** Maximum POST/PUT request body size (10 MB) */
const MAX_BODY_SIZE = 10 * 1024 * 1024;

function tokenMatches(given: unknown, expected: string): boolean {
  if (typeof given !== 'string' || !given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export class PeerServer {
  private server: ReturnType<typeof createServer> | null = null;
  private callbacks: PeerServerCallbacks;
  private started = false;
  private actualPort = 0;
  private currentPeerInfo: PeerInfo | null = null;
  private todos: MeshTodo[] = [];
  /** Auth token generated on start — required on all protected endpoints */
  private authToken = '';
  /** Extra metadata broadcast via /peer-info */
  extraInfo: Record<string, string> = {};
  /** SSE clients — response objects kept alive for real-time events */
  private sseClients = new Set<ServerResponse>();

  // ── Queue state ──────────────────────────────────────────────
  private taskQueue: SwarmTask[] = [];
  /** Tasks currently executing, keyed by task ID. Bounded by maxConcurrentTasks. */
  private runningTasks = new Map<
    string,
    { task: SwarmTask; worktreePath?: string; worktreeBranch?: string; gitRoot?: string; hookBased?: boolean }
  >();
  /** Bounded history of terminal (completed/failed/cancelled) tasks — used for
   *  dependsOn resolution and persisted so a restart doesn't lose visibility. */
  private taskHistory: SwarmTask[] = [];
  private readonly maxQueueSize = 50;
  private readonly maxConcurrentTasks: number;
  private readonly isolateWorktrees: boolean;
  private readonly persistTasks: boolean;

  constructor(callbacks?: PeerServerCallbacks, options?: PeerServerOptions) {
    this.callbacks = callbacks ?? {};
    this.maxConcurrentTasks = Math.max(1, options?.maxConcurrentTasks ?? 1);
    this.isolateWorktrees = options?.isolateWorktrees ?? false;
    this.persistTasks = options?.persist ?? false;
    if (this.persistTasks) this.hydrateTasksFromDisk();
  }

  /** Restore the queued + terminal tasks persisted by a previous run. Any
   *  task that was 'running' when the process stopped can't have survived —
   *  it's rehydrated as 'failed' so callers see it was interrupted rather
   *  than silently vanishing. */
  private hydrateTasksFromDisk(): void {
    const state = loadPeerTasks();
    if (!state) return;
    for (const task of state.tasks) {
      if (task.status === 'queued') {
        this.taskQueue.push(task);
      } else if (task.status === 'running') {
        task.status = 'failed';
        task.error = 'Interrupted by restart';
        task.completedAt = task.completedAt ?? Date.now();
        this.taskHistory.push(task);
      } else {
        this.taskHistory.push(task);
      }
    }
    if (state.tasks.length > 0) {
      logForDebugging(
        `[PeerServer] Restored ${this.taskQueue.length} queued + ${this.taskHistory.length} historical task(s) from disk`,
      );
    }
  }

  /** Snapshot queued + terminal tasks for persistence (never includes 'running'). */
  private taskSnapshot(): PersistedSwarmTasks {
    return {
      version: 1,
      tasks: [...this.taskQueue, ...this.taskHistory],
    };
  }

  /** Schedule a debounced save if persistence is enabled. */
  private persistTaskState(): void {
    if (!this.persistTasks) return;
    schedulePeerTasksSave(() => this.taskSnapshot());
  }

  setCallbacks(callbacks: PeerServerCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * Update the stored peer info (e.g. after a name change via setLocalName).
   */
  updatePeerInfo(updates: Partial<PeerInfo>): void {
    if (this.currentPeerInfo) {
      this.currentPeerInfo = { ...this.currentPeerInfo, ...updates };
    }
  }

  /**
   * Start the server. Idempotent — returns existing port if already started.
   */
  /** The current auth token used to validate incoming requests. */
  get token(): string {
    return this.authToken;
  }

  async start(peerInfo: PeerInfo): Promise<number> {
    if (this.started) return this.actualPort;
    this.currentPeerInfo = peerInfo;
    this.authToken = randomUUID();

    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => {
        this.handleHttpRequest(req, res);
      });

      this.server.on('error', err => {
        logForDebugging(`[PeerServer] Error: ${errorMessage(err)}`);
        reject(err);
      });

      // Listen on port 0 (OS picks a free port) on localhost only
      // Listen on all interfaces so LAN peers can connect (auth token protects against unauthorized access)
      this.server.listen(0, '0.0.0.0', () => {
        const addr = this.server!.address() as AddressInfo;
        this.actualPort = addr.port;
        this.started = true;
        logForDebugging(`[PeerServer] Listening on port ${this.actualPort}`);
        resolve(this.actualPort);
      });
    });
  }

  /**
   * Stop the server.
   */
  stop(): void {
    this.started = false;
    // Close SSE connections
    for (const client of this.sseClients) {
      try {
        client.end();
      } catch {
        /* ignore */
      }
    }
    this.sseClients.clear();
    if (this.server) {
      try {
        this.server.close();
      } catch {
        /* ignore */
      }
      this.server = null;
    }
    if (this.persistTasks) void flushPeerTasksSave();
  }

  /**
   * Get the actual port the server is listening on.
   */
  get port(): number {
    return this.actualPort;
  }

  /**
   * Get pending todos.
   */
  getTodos(): MeshTodo[] {
    return this.todos;
  }

  /**
   * Mark a todo as done/rejected.
   */
  updateTodoStatus(id: string, status: 'done' | 'rejected'): boolean {
    const todo = this.todos.find(t => t.id === id);
    if (!todo) return false;
    todo.status = status;
    return true;
  }

  // ── Queue public API ─────────────────────────────────────────

  /** Whether the server is at capacity (won't accept another task without queuing) */
  get isBusy(): boolean {
    return this.runningTasks.size >= this.maxConcurrentTasks;
  }

  /** Number of tasks waiting in the queue */
  get queueDepth(): number {
    return this.taskQueue.length;
  }

  /** Currently executing tasks. */
  private currentTasks(): SwarmTask[] {
    return Array.from(this.runningTasks.values(), r => r.task);
  }

  /**
   * Get all tasks (queued + currently running). `current` is the first
   * running task (or null) for backward compatibility with single-task
   * callers; `running` lists every task executing right now.
   */
  getTasks(): { queue: SwarmTask[]; current: SwarmTask | null; running: SwarmTask[] } {
    const running = this.currentTasks();
    return { queue: [...this.taskQueue], current: running[0] ?? null, running };
  }

  private publicPeerInfo(): Record<string, any> {
    const { cwd: _cwd, ...peerInfo } = this.currentPeerInfo ?? {};
    const { command: _command, cwd: _extraCwd, ...extraInfo } = this.extraInfo;
    return {
      ...peerInfo,
      ...extraInfo,
      isBusy: this.isBusy,
      queueDepth: this.taskQueue.length,
    };
  }

  private publicTaskInfo(task: SwarmTask): Record<string, any> {
    return {
      id: task.id,
      from: task.from,
      status: task.status,
      priority: task.priority,
      createdAt: task.createdAt,
      startedAt: task.startedAt,
    };
  }

  /** Push a terminal task into the bounded history and persist. */
  private recordHistory(task: SwarmTask): void {
    this.taskHistory.push(task);
    const overflow = this.taskHistory.length - 200;
    if (overflow > 0) this.taskHistory.splice(0, overflow);
    this.persistTaskState();
  }

  /**
   * Cancel a queued task by ID. Returns true if found and cancelled.
   */
  cancelQueuedTask(id: string): boolean {
    const idx = this.taskQueue.findIndex(t => t.id === id);
    if (idx === -1) return false;
    const task = this.taskQueue[idx]!;
    task.status = 'cancelled';
    task.completedAt = Date.now();
    this.taskQueue.splice(idx, 1);
    this.recordHistory(task);
    this.emitQueueUpdate();
    return true;
  }

  /**
   * Cancel all queued tasks. Returns the number cancelled.
   */
  cancelAllQueuedTasks(): number {
    const count = this.taskQueue.length;
    for (const task of this.taskQueue) {
      task.status = 'cancelled';
      task.completedAt = Date.now();
      this.recordHistory(task);
    }
    this.taskQueue = [];
    if (count > 0) this.emitQueueUpdate();
    return count;
  }

  // ── SSE (Server-Sent Events) ──────────────────────────────

  /**
   * Send an event to all connected SSE clients.
   */
  private broadcastSSE(event: MeshEvent): void {
    const data = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(data);
      } catch {
        this.sseClients.delete(client);
      }
    }
  }

  /**
   * Handle an SSE subscription request.
   * Keeps the connection open and sends events as they occur.
   */
  private handleSSE(req: IncomingMessage, res: ServerResponse): void {
    const origin = req.headers.origin;
    const headers: Record<string, string> = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    };
    if (origin && /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(origin)) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers.Vary = 'Origin';
    }
    res.writeHead(200, headers);

    // Send initial connection event with queue state
    const { queue, current } = this.getTasks();
    res.write(
      `event: connected\ndata: ${JSON.stringify({ status: 'ok', isBusy: this.isBusy, queueDepth: this.taskQueue.length, currentTask: current, queue })}\n\n`,
    );

    this.sseClients.add(res);

    // Keep-alive ping every 30s to prevent proxy timeouts
    const keepAlive = setInterval(() => {
      try {
        res.write(`:keepalive\n\n`);
      } catch {
        clearInterval(keepAlive);
        this.sseClients.delete(res);
      }
    }, 30_000);

    // Clean up on disconnect
    req.on('close', () => {
      clearInterval(keepAlive);
      this.sseClients.delete(res);
    });
  }

  /**
   * Broadcast an event to all SSE subscribers.
   * Can be called externally to notify about peer store changes.
   */
  broadcastEvent(type: MeshEventType, data: any): void {
    this.broadcastSSE({ type, data, timestamp: Date.now() });
  }

  // ── Queue execution ──────────────────────────────────────────

  /** Emit queue_update SSE event and callback */
  private emitQueueUpdate(): void {
    const { queue, current, running } = this.getTasks();
    const data = {
      isBusy: this.isBusy,
      queueDepth: this.taskQueue.length,
      currentTask: current
        ? {
            id: current.id,
            command: current.command,
            from: current.from,
            status: current.status,
            priority: current.priority,
            createdAt: current.createdAt,
          }
        : null,
      // Additive field: every task currently executing (not just the first).
      runningTasks: running.map(t => ({
        id: t.id,
        command: t.command,
        from: t.from,
        status: t.status,
        priority: t.priority,
        createdAt: t.createdAt,
      })),
      queue: queue.map(t => ({
        id: t.id,
        command: t.command,
        from: t.from,
        status: t.status,
        priority: t.priority,
        createdAt: t.createdAt,
      })),
    };
    this.broadcastSSE({ type: 'queue_update', data, timestamp: Date.now() });
    this.callbacks.onQueueUpdate?.(queue, current);

    // Sync to extraInfo so /peer-info reflects queue state
    this.extraInfo.isBusy = String(this.isBusy);
    this.extraInfo.queueDepth = String(this.taskQueue.length);
  }

  /**
   * A task is runnable once every ID in `dependsOn` refers to a task that
   * completed successfully. Unknown/missing IDs fail closed — a typo'd
   * dependency blocks the task rather than letting it run immediately.
   */
  private dependenciesMet(task: SwarmTask): boolean {
    if (!task.dependsOn || task.dependsOn.length === 0) return true;
    return task.dependsOn.every(depId => this.taskHistory.some(t => t.id === depId && t.status === 'completed'));
  }

  /** Index of the next queued task whose dependencies are satisfied, or -1. */
  private nextRunnableIndex(): number {
    return this.taskQueue.findIndex(t => this.dependenciesMet(t));
  }

  /**
   * Try to queue a task. Returns null when the caller should execute it
   * directly (capacity is free and it has no unmet dependency) — otherwise
   * the task is queued and its position returned.
   */
  private tryQueue(
    command: string,
    from: string,
    fromName: string,
    priority: MeshTaskPriority = 'normal',
    dependsOn?: string[],
  ): { queued: true; id: string; queuePosition: number } | { queued: false; error: string } | null {
    // Idle with no blocking dependency — don't queue, let the caller execute directly.
    if (!this.isBusy && (!dependsOn || dependsOn.length === 0)) return null;

    if (this.taskQueue.length >= this.maxQueueSize) {
      return { queued: false, error: 'Queue full' };
    }

    const task: SwarmTask = {
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      command,
      from,
      fromName,
      status: 'queued',
      priority,
      createdAt: Date.now(),
      ...(dependsOn && dependsOn.length > 0 ? { dependsOn } : {}),
    };

    if (priority === 'high') {
      this.taskQueue.unshift(task);
    } else {
      this.taskQueue.push(task);
    }

    this.persistTaskState();
    this.emitQueueUpdate();
    return { queued: true, id: task.id, queuePosition: this.taskQueue.length };
  }

  /** Mark a task as running and register it in runningTasks (called before executing). */
  private beginTask(task: SwarmTask): void {
    task.status = 'running';
    task.startedAt = Date.now();
    this.runningTasks.set(task.id, { task });
    this.persistTaskState();
    this.emitQueueUpdate();
  }

  /** Mark a task as completed/failed, move it to history, and try to schedule more. */
  private settleTask(
    task: SwarmTask,
    result?: { stdout: string; stderr: string; exitCode: number },
    error?: string,
  ): void {
    if (error) {
      task.status = 'failed';
      task.error = error;
    } else {
      task.status = 'completed';
      task.result = result;
    }
    task.completedAt = Date.now();
    this.runningTasks.delete(task.id);
    this.recordHistory(task);
    this.emitQueueUpdate();
    this.tryRunMore();
  }

  /**
   * Execute a task's command, optionally inside an isolated git worktree so
   * concurrent/queued tasks (and the peer's own interactive session) never
   * step on the same files. Falls back to the shared cwd if worktree
   * creation fails (e.g. not a git repo) rather than failing the task.
   */
  private async execTask(task: SwarmTask): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    let worktree: { worktreePath?: string; worktreeBranch?: string; gitRoot?: string; hookBased?: boolean } = {};

    if (this.isolateWorktrees) {
      try {
        const created = await createAgentWorktree(`swarm-${task.id}`);
        worktree = {
          worktreePath: created.worktreePath,
          worktreeBranch: created.worktreeBranch,
          gitRoot: created.gitRoot,
          hookBased: created.hookBased,
        };
        task.worktreePath = created.worktreePath;
        const entry = this.runningTasks.get(task.id);
        if (entry) Object.assign(entry, worktree);
      } catch (err) {
        logForDebugging(
          `[PeerServer] worktree isolation failed for task ${task.id}, running in shared cwd: ${errorMessage(err)}`,
        );
      }
    }

    if (!this.callbacks.onExec) {
      const err = 'Exec not supported';
      this.settleTask(task, undefined, err);
      throw new Error(err);
    }

    try {
      const result = await this.callbacks.onExec(task.command, worktree.worktreePath);
      this.settleTask(task, result);
      return result;
    } catch (err) {
      this.settleTask(task, undefined, errorMessage(err));
      throw err;
    } finally {
      if (worktree.worktreePath) {
        void removeAgentWorktree(
          worktree.worktreePath,
          worktree.worktreeBranch,
          worktree.gitRoot,
          worktree.hookBased,
        ).catch(err => logForDebugging(`[PeerServer] failed to remove task worktree: ${errorMessage(err)}`));
      }
    }
  }

  /** Pull and start as many runnable queued tasks as capacity allows. */
  private tryRunMore(): void {
    if (!this.callbacks.onExec) return;
    while (this.runningTasks.size < this.maxConcurrentTasks) {
      const idx = this.nextRunnableIndex();
      if (idx === -1) break;
      const task = this.taskQueue.splice(idx, 1)[0]!;
      this.beginTask(task);
      void this.execTask(task).catch(() => {
        // Already recorded via settleTask inside execTask; swallow here so a
        // rejected promise from this fire-and-forget call never surfaces as
        // an unhandled rejection.
      });
    }
  }

  // ── HTTP request handling ────────────────────────────────────

  /**
   * Send a standard 401 response for missing/invalid token.
   */
  private sendUnauthorized(res: ServerResponse): void {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized: invalid or missing token' }));
  }

  /**
   * Send a standard 413 response for oversized body.
   */
  private sendTooLarge(res: ServerResponse): void {
    res.writeHead(413, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Request body too large' }));
  }

  /**
   * Handle HTTP requests with security checks:
   * 1. Body size limit (prevent local DoS)
   * 2. Token authentication (prevent unauthorized access)
   */
  private handleHttpRequest(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const body: Buffer[] = [];
    let bodyLength = 0;

    req.on('data', (chunk: Buffer) => {
      bodyLength += chunk.length;
      if (bodyLength > MAX_BODY_SIZE) {
        req.destroy();
        return;
      }
      body.push(chunk);
    });

    req.on('end', () => {
      try {
        // ── 2. Body size check (early return if oversized) ──────
        if (bodyLength > MAX_BODY_SIZE) {
          this.sendTooLarge(res);
          return;
        }

        switch (url.pathname) {
          // ── Public endpoints (no auth needed) ─────────────────

          case '/peer-info': {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(this.publicPeerInfo()));
            break;
          }

          case '/peer-queue-status': {
            const { queue, current, running } = this.getTasks();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                isBusy: this.isBusy,
                currentTask: current ? this.publicTaskInfo(current) : null,
                runningTasks: running.map(t => this.publicTaskInfo(t)),
                queueDepth: this.taskQueue.length,
                queue: queue.map(t => this.publicTaskInfo(t)),
              }),
            );
            break;
          }

          // ── Auth-required GET endpoints (token in query param) ──

          case '/peer-events': {
            // Token via ?token= query param
            const token = url.searchParams.get('token') ?? '';
            if (!tokenMatches(token, this.authToken)) {
              this.sendUnauthorized(res);
              return;
            }
            this.handleSSE(req, res);
            break;
          }

          case '/peer-memory-export': {
            // Cross-peer memory sync: export this node's top memories.
            const token = url.searchParams.get('token') ?? '';
            if (!tokenMatches(token, this.authToken)) {
              this.sendUnauthorized(res);
              return;
            }
            const limit = Math.min(Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10) || 50), 200);
            void (async () => {
              try {
                const { exportLocalMemories } = await import('../memory/peerSync.js');
                const payload = await exportLocalMemories(limit);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(payload));
              } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
              }
            })();
            break;
          }

          case '/broker/recv': {
            // Token via ?token= query param
            const token = url.searchParams.get('token') ?? '';
            if (!tokenMatches(token, this.authToken)) {
              this.sendUnauthorized(res);
              return;
            }
            const peersParam = (url.searchParams.get('peers') ?? '').trim();
            const rolesParam = (url.searchParams.get('roles') ?? '').trim();
            const replyTo = (url.searchParams.get('replyTo') ?? '').trim();
            const timeoutSec = Math.min(Math.max(0, parseInt(url.searchParams.get('timeout') ?? '30', 10) || 30), 120);
            const store = getGlobalPeerStore();

            // Build target list from peers + roles
            const targets: string[] = [];
            if (peersParam)
              targets.push(
                ...peersParam
                  .split(',')
                  .map(s => s.trim())
                  .filter(Boolean),
              );
            if (rolesParam)
              targets.push(
                ...rolesParam
                  .split(',')
                  .map(s => s.trim())
                  .filter(Boolean),
              );

            // If waiting for a reply
            if (replyTo) {
              store
                .waitForReply(replyTo, timeoutSec * 1000)
                .then(reply => {
                  if (res.destroyed) return;
                  if (reply) {
                    reply.delivered = true;
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ messages: [reply] }));
                  } else {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ messages: [] }));
                  }
                })
                .catch(err => {
                  if (res.destroyed) return;
                  res.writeHead(500, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: errorMessage(err) }));
                });
              return;
            }

            // Long-poll for new messages
            store
              .waitForBrokerMessages(targets, timeoutSec * 1000)
              .then(msgs => {
                if (res.destroyed) return;
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ messages: msgs }));
              })
              .catch(err => {
                if (res.destroyed) return;
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: errorMessage(err) }));
              });
            return;
          }

          // ── Auth-required POST endpoints (token in JSON body) ──

          case '/peer-msg': {
            const data = JSON.parse(Buffer.concat(body).toString());
            if (!tokenMatches(data.token, this.authToken)) {
              this.sendUnauthorized(res);
              return;
            }
            const msg: MeshChatMessage = {
              id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              from: data.from ?? 'unknown',
              fromName: data.fromName ?? data.from ?? 'unknown',
              text: data.text ?? '',
              color: peerColorFromId(data.from ?? ''),
              timestamp: Date.now(),
              chunkGroup: data.chunkGroup,
              chunkIndex: data.chunkIndex !== undefined ? Number(data.chunkIndex) : undefined,
              chunkTotal: data.chunkTotal !== undefined ? Number(data.chunkTotal) : undefined,
              senderRole: data.senderRole,
              senderPort: data.senderPort !== undefined ? Number(data.senderPort) : undefined,
            };
            this.callbacks.onMessage?.(msg);
            this.broadcastSSE({ type: 'new_message', data: msg, timestamp: Date.now() });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, id: msg.id }));
            break;
          }

          case '/peer-todo': {
            const data = JSON.parse(Buffer.concat(body).toString());
            if (!tokenMatches(data.token, this.authToken)) {
              this.sendUnauthorized(res);
              return;
            }
            const todo: MeshTodo = {
              id: `todo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              from: data.from ?? 'unknown',
              fromName: data.fromName ?? data.from ?? 'unknown',
              message: data.message ?? '',
              createdAt: Date.now(),
              status: 'pending',
            };
            this.todos.push(todo);
            this.callbacks.onTodo?.(todo);
            this.broadcastSSE({ type: 'new_todo', data: todo, timestamp: Date.now() });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, id: todo.id }));
            break;
          }

          case '/peer-exec': {
            const data = JSON.parse(Buffer.concat(body).toString());
            if (!tokenMatches(data.token, this.authToken)) {
              this.sendUnauthorized(res);
              return;
            }
            if (!this.callbacks.onExec) {
              res.writeHead(501, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ stdout: '', stderr: 'Exec not supported', exitCode: 1 }));
              return;
            }

            const command: string = data.command ?? '';
            const from: string = data.from ?? 'unknown';
            const fromName: string = data.fromName ?? data.from ?? 'unknown';
            const priority: MeshTaskPriority = data.priority ?? 'normal';
            const dependsOn: string[] | undefined = Array.isArray(data.dependsOn)
              ? data.dependsOn.filter((d: unknown): d is string => typeof d === 'string')
              : undefined;

            // Try to queue first
            const queueResult = this.tryQueue(command, from, fromName, priority, dependsOn);

            if (queueResult?.queued) {
              // Task was queued. Opportunistically start it now if capacity is
              // free and its dependencies (if any) are already satisfied.
              this.tryRunMore();
              res.writeHead(202, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  queued: true,
                  id: queueResult.id,
                  queuePosition: queueResult.queuePosition,
                  queueDepth: this.taskQueue.length,
                }),
              );
              return;
            }

            if (queueResult?.error) {
              // Queue full or other error
              res.writeHead(503, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: queueResult.error, queueDepth: this.taskQueue.length }));
              return;
            }

            // Execute immediately (capacity was free and no dependsOn)
            const task: SwarmTask = {
              id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              command,
              from,
              fromName,
              status: 'queued',
              priority,
              createdAt: Date.now(),
            };
            this.beginTask(task);

            this.execTask(task)
              .then(result => {
                if (res.destroyed) return;
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(
                  JSON.stringify({
                    running: true,
                    id: task.id,
                    result,
                  }),
                );
              })
              .catch(err => {
                if (res.destroyed) return;
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ stdout: '', stderr: errorMessage(err), exitCode: 1 }));
              });
            break;
          }

          case '/peer-queue-cancel': {
            const data = JSON.parse(Buffer.concat(body).toString());
            if (!tokenMatches(data.token, this.authToken)) {
              this.sendUnauthorized(res);
              return;
            }
            if (!data.id) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Missing task id' }));
              return;
            }
            const ok = this.cancelQueuedTask(data.id);
            res.writeHead(ok ? 200 : 404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok, id: data.id }));
            break;
          }

          case '/peer-queue-cancel-all': {
            const data = JSON.parse(Buffer.concat(body).toString());
            if (!tokenMatches(data.token, this.authToken)) {
              this.sendUnauthorized(res);
              return;
            }
            const count = this.cancelAllQueuedTasks();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, cancelled: count }));
            break;
          }

          // ── Broker endpoints ──────────────────────────────────

          case '/broker/send': {
            const data = JSON.parse(Buffer.concat(body).toString());
            if (!tokenMatches(data.token, this.authToken)) {
              this.sendUnauthorized(res);
              return;
            }
            const msg: BrokerMessage = {
              id: `brk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              from: data.from ?? 'unknown',
              fromName: data.fromName ?? data.from ?? 'unknown',
              to: data.to ?? '*',
              text: data.text ?? '',
              replyTo: data.replyTo,
              timestamp: Date.now(),
              delivered: false,
            };
            const store = getGlobalPeerStore();
            store.addToOutbox(msg);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, id: msg.id }));
            break;
          }

          case '/broker/reply': {
            const data = JSON.parse(Buffer.concat(body).toString());
            if (!tokenMatches(data.token, this.authToken)) {
              this.sendUnauthorized(res);
              return;
            }
            const replyMsg: BrokerMessage = {
              id: `brk_reply_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              from: data.from ?? 'unknown',
              fromName: data.fromName ?? data.from ?? 'unknown',
              to: data.to ?? '*',
              text: data.text ?? '',
              replyTo: data.replyTo,
              timestamp: Date.now(),
              delivered: false,
            };
            const store = getGlobalPeerStore();
            store.addToOutbox(replyMsg);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, id: replyMsg.id }));
            break;
          }

          default:
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not found');
            break;
        }
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end(`Bad request: ${errorMessage(err)}`);
      }
    });
  }
}

/**
 * Singleton peer server instance.
 */
let globalPeerServer: PeerServer | null = null;

export function getGlobalPeerServer(): PeerServer {
  if (!globalPeerServer) {
    // Production defaults: persist the task queue across restarts, run up to
    // 2 tasks concurrently, and isolate each task's shell command in its own
    // git worktree. Tests construct `new PeerServer()` directly and get the
    // conservative defaults (persist/isolateWorktrees off, concurrency 1) so
    // unit tests never touch disk or trigger real git worktree creation.
    globalPeerServer = new PeerServer(undefined, {
      persist: true,
      isolateWorktrees: true,
      maxConcurrentTasks: 2,
    });
  }
  return globalPeerServer;
}
