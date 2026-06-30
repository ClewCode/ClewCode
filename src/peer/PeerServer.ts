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
import { getGlobalPeerStore } from './PeerStore.js';
import {
  type BrokerMessage,
  type MeshChatMessage,
  type MeshTaskPriority,
  type MeshTodo,
  type PeerColor,
  type PeerInfo,
  peerColorFromId,
  type PeerPermissionRequest,
  type PeerPermissionResolution,
  type SwarmTask,
} from './types.js';

export type PeerServerCallbacks = {
  onMessage?: (msg: MeshChatMessage) => void;
  onTodo?: (todo: MeshTodo) => void;
  onExec?: (command: string) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  onChatConnected?: (meshName: string, color: PeerColor) => void;
  onChatDisconnected?: (meshName: string) => void;
  /** Called when a queued task starts or completes */
  onQueueUpdate?: (queue: SwarmTask[], currentTask: SwarmTask | null) => void;
  /** Called when a spawned peer forwards a permission request for parent approval */
  onPermissionRequest?: (req: PeerPermissionRequest) => void;
};

/** How long the server holds a /peer-permission poll open before replying "pending" (ms) */
const PERMISSION_POLL_HOLD_MS = 280_000;
/** Drop an unresolved permission entry after this long with no activity (ms) */
const PERMISSION_ENTRY_TTL_MS = 30 * 60_000;

type PendingPeerPermission = {
  request: PeerPermissionRequest;
  resolution: PeerPermissionResolution | null;
  /** Waiters parked on a long-poll, woken when the parent resolves */
  waiters: Set<(resolution: PeerPermissionResolution | null) => void>;
  /** TTL cleanup timer */
  expiry: ReturnType<typeof setTimeout>;
};

export type MeshEventType = 'new_message' | 'new_todo' | 'swarm_online' | 'swarm_offline' | 'queue_update';

export type MeshEvent = {
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
  private isBusyInternal = false;
  private currentTask: SwarmTask | null = null;
  private readonly maxQueueSize = 50;

  // ── Forwarded peer permission state ──────────────────────────
  /** Permission requests forwarded by spawned peers, keyed by requestId */
  private pendingPermissions = new Map<string, PendingPeerPermission>();

  constructor(callbacks?: PeerServerCallbacks) {
    this.callbacks = callbacks ?? {};
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
    // Wake and drop any parked permission waiters so workers stop hanging.
    for (const entry of this.pendingPermissions.values()) {
      clearTimeout(entry.expiry);
      for (const w of entry.waiters) w(null);
      entry.waiters.clear();
    }
    this.pendingPermissions.clear();
    if (this.server) {
      try {
        this.server.close();
      } catch {
        /* ignore */
      }
      this.server = null;
    }
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

  /** Whether the server is currently executing a task */
  get isBusy(): boolean {
    return this.isBusyInternal;
  }

  /** Number of tasks waiting in the queue */
  get queueDepth(): number {
    return this.taskQueue.length;
  }

  /** Get all tasks (queued + currently running) */
  getTasks(): { queue: SwarmTask[]; current: SwarmTask | null } {
    return { queue: [...this.taskQueue], current: this.currentTask };
  }

  private publicPeerInfo(): Record<string, any> {
    const { cwd: _cwd, ...peerInfo } = this.currentPeerInfo ?? {};
    const { command: _command, cwd: _extraCwd, ...extraInfo } = this.extraInfo;
    return {
      ...peerInfo,
      ...extraInfo,
      isBusy: this.isBusyInternal,
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

  /**
   * Cancel a queued task by ID. Returns true if found and cancelled.
   */
  cancelQueuedTask(id: string): boolean {
    const idx = this.taskQueue.findIndex(t => t.id === id);
    if (idx === -1) return false;
    this.taskQueue[idx]!.status = 'cancelled';
    this.taskQueue.splice(idx, 1);
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
    }
    this.taskQueue = [];
    if (count > 0) this.emitQueueUpdate();
    return count;
  }

  // ── Forwarded peer permissions ───────────────────────────────

  /**
   * Register (or look up) a forwarded permission request. Idempotent by
   * requestId: a re-POST from a re-polling worker returns the existing entry
   * and does NOT re-fire the onPermissionRequest callback.
   *
   * @returns the entry and whether it was newly created
   */
  private getOrCreatePermissionEntry(request: PeerPermissionRequest): {
    entry: PendingPeerPermission;
    created: boolean;
  } {
    const existing = this.pendingPermissions.get(request.requestId);
    if (existing) return { entry: existing, created: false };

    const entry: PendingPeerPermission = {
      request,
      resolution: null,
      waiters: new Set(),
      expiry: setTimeout(() => {
        // Unresolved for too long — wake any waiters with null so workers stop
        // hanging, then drop the entry.
        const e = this.pendingPermissions.get(request.requestId);
        if (e) {
          for (const w of e.waiters) w(null);
          e.waiters.clear();
          this.pendingPermissions.delete(request.requestId);
        }
      }, PERMISSION_ENTRY_TTL_MS),
    };
    this.pendingPermissions.set(request.requestId, entry);
    return { entry, created: true };
  }

  /**
   * Resolve a forwarded permission request. Called by the parent UI when the
   * user approves/rejects. Wakes any parked long-poll waiters.
   *
   * @returns true if a matching pending request was found
   */
  resolvePeerPermission(requestId: string, resolution: PeerPermissionResolution): boolean {
    const entry = this.pendingPermissions.get(requestId);
    if (!entry) return false;
    entry.resolution = resolution;
    for (const w of entry.waiters) w(resolution);
    entry.waiters.clear();
    return true;
  }

  /** Snapshot of permission requests still awaiting a decision (for the UI). */
  getPendingPeerPermissions(): PeerPermissionRequest[] {
    return [...this.pendingPermissions.values()].filter(e => e.resolution === null).map(e => e.request);
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
      `event: connected\ndata: ${JSON.stringify({ status: 'ok', isBusy: this.isBusyInternal, queueDepth: this.taskQueue.length, currentTask: current, queue })}\n\n`,
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
    const { queue, current } = this.getTasks();
    const data = {
      isBusy: this.isBusyInternal,
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
    this.extraInfo.isBusy = String(this.isBusyInternal);
    this.extraInfo.queueDepth = String(this.taskQueue.length);
  }

  /**
   * Try to queue a task. If the server is idle, returns null (caller should execute directly).
   * If busy, queues and returns the queue position.
   */
  private tryQueue(
    command: string,
    from: string,
    fromName: string,
    priority: MeshTaskPriority = 'normal',
  ): { queued: true; id: string; queuePosition: number } | { queued: false; error: string } | null {
    // If idle — don't queue, let the caller execute directly
    if (!this.isBusyInternal) return null;

    // Busy — check queue capacity
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
    };

    if (priority === 'high') {
      this.taskQueue.unshift(task);
    } else {
      this.taskQueue.push(task);
    }

    this.emitQueueUpdate();
    return { queued: true, id: task.id, queuePosition: this.taskQueue.length };
  }

  /**
   * Mark a task as running (called before executing).
   */
  private startTask(task: SwarmTask): void {
    this.isBusyInternal = true;
    this.currentTask = task;
    task.status = 'running';
    task.startedAt = Date.now();
    this.emitQueueUpdate();
  }

  /**
   * Mark a task as completed/failed and check the queue for the next task.
   */
  private finishTask(
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
    this.isBusyInternal = false;
    this.currentTask = null;
    this.emitQueueUpdate();

    // Dequeue next if any
    this.dequeueNext();
  }

  /**
   * Dequeue and execute the next task if one is waiting.
   */
  private dequeueNext(): void {
    if (this.taskQueue.length === 0 || !this.callbacks.onExec) return;

    const task = this.taskQueue.shift()!;
    this.startTask(task);

    this.callbacks
      .onExec(task.command)
      .then(result => this.finishTask(task, result))
      .catch(err => this.finishTask(task, undefined, errorMessage(err)));
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
            const { queue, current } = this.getTasks();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                isBusy: this.isBusyInternal,
                currentTask: current ? this.publicTaskInfo(current) : null,
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
              store.waitForReply(replyTo, timeoutSec * 1000).then(reply => {
                if (res.destroyed) return;
                if (reply) {
                  reply.delivered = true;
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ messages: [reply] }));
                } else {
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ messages: [] }));
                }
              });
              return;
            }

            // Long-poll for new messages
            store.waitForBrokerMessages(targets, timeoutSec * 1000).then(msgs => {
              if (res.destroyed) return;
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ messages: msgs }));
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

            // Try to queue first
            const queueResult = this.tryQueue(command, from, fromName, priority);

            if (queueResult?.queued) {
              // Task was queued
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

            // Execute immediately
            const task: SwarmTask = {
              id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              command,
              from,
              fromName,
              status: 'queued',
              priority,
              createdAt: Date.now(),
            };
            this.startTask(task);

            this.callbacks
              .onExec(command)
              .then(result => {
                this.finishTask(task, result);
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
                const errMsg = errorMessage(err);
                this.finishTask(task, undefined, errMsg);
                if (res.destroyed) return;
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ stdout: '', stderr: errMsg, exitCode: 1 }));
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

          // ── Forwarded peer permission endpoint ────────────────

          case '/peer-permission': {
            const data = JSON.parse(Buffer.concat(body).toString());
            if (!tokenMatches(data.token, this.authToken)) {
              this.sendUnauthorized(res);
              return;
            }

            const requestId: string = data.requestId ?? '';
            if (!requestId) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Missing requestId' }));
              return;
            }

            const request: PeerPermissionRequest = {
              requestId,
              fromName: data.fromName ?? 'peer',
              toolName: data.toolName ?? 'unknown',
              toolUseId: data.toolUseId ?? requestId,
              description: data.description ?? '',
              input: (data.input ?? {}) as Record<string, unknown>,
              createdAt: Date.now(),
            };

            const { entry, created } = this.getOrCreatePermissionEntry(request);
            // Surface in the parent's permission UI only on first sighting.
            if (created) this.callbacks.onPermissionRequest?.(request);

            // Already resolved (parent decided before/between polls) — reply now.
            if (entry.resolution) {
              const resolution = entry.resolution;
              clearTimeout(entry.expiry);
              this.pendingPermissions.delete(requestId);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ status: 'resolved', ...resolution }));
              return;
            }

            // Park a long-poll waiter; reply "pending" after the hold window so
            // the worker re-polls (callback won't re-fire — entry persists).
            let settled = false;
            const waiter = (resolution: PeerPermissionResolution | null): void => {
              if (settled) return;
              settled = true;
              clearTimeout(holdTimer);
              entry.waiters.delete(waiter);
              if (res.destroyed) return;
              if (resolution) {
                clearTimeout(entry.expiry);
                this.pendingPermissions.delete(requestId);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'resolved', ...resolution }));
              } else {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'pending' }));
              }
            };
            const holdTimer = setTimeout(() => waiter(null), PERMISSION_POLL_HOLD_MS);
            entry.waiters.add(waiter);
            req.on('close', () => {
              if (settled) return;
              settled = true;
              clearTimeout(holdTimer);
              entry.waiters.delete(waiter);
            });
            return;
          }

          // ── Memory export endpoint ────────────────────────────

          case '/memory/export': {
            const data = JSON.parse(Buffer.concat(body).toString());
            if (!tokenMatches(data.token, this.authToken)) {
              this.sendUnauthorized(res);
              return;
            }
            // Must run synchronously — handleHttpRequest is not async.
            // Use a top-level require-style via dynamic import cached by ESM.
            (async () => {
              try {
                const { MemoryDB } = await import('../../memory/database.js');
                if (MemoryDB.isInitialized()) {
                  const limit = typeof data.limit === 'number' ? data.limit : 50;
                  const projectPath = typeof data.projectPath === 'string' ? data.projectPath : undefined;
                  const memories = MemoryDB.getInstance().exportMemories(limit, projectPath);
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ ok: true, count: memories.length, memories }));
                } else {
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ ok: true, count: 0, memories: [] }));
                }
              } catch (error) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: String(error) }));
              }
            })().catch(() => res.end('{}'));
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
    globalPeerServer = new PeerServer();
  }
  return globalPeerServer;
}
