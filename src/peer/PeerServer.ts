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
 * - WebSocket /peer-chat → real-time chat between two peers
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { logForDebugging } from '../utils/debug.js';
import { errorMessage } from '../utils/errors.js';
import {
  type MeshChatMessage,
  type PeerColor,
  type PeerInfo,
  type SwarmTask,
  type MeshTaskPriority,
  type MeshTodo,
  peerColorFromId,
} from './types.js';

export type PeerServerCallbacks = {
  onMessage?: (msg: MeshChatMessage) => void;
  onTodo?: (todo: MeshTodo) => void;
  onExec?: (command: string) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  onChatConnected?: (meshName: string, color: PeerColor) => void;
  onChatDisconnected?: (meshName: string) => void;
  /** Called when a queued task starts or completes */
  onQueueUpdate?: (queue: SwarmTask[], currentTask: SwarmTask | null) => void;
};

export type MeshEventType = 'new_message' | 'new_todo' | 'swarm_online' | 'swarm_offline' | 'queue_update';

export type MeshEvent = {
  type: MeshEventType;
  data: any;
  timestamp: number;
};

export class PeerServer {
  private server: ReturnType<typeof createServer> | null = null;
  private wsClients = new Set<WebSocket>();
  private callbacks: PeerServerCallbacks;
  private started = false;
  private actualPort = 0;
  private currentPeerInfo: PeerInfo | null = null;
  private todos: MeshTodo[] = [];
  /** Extra metadata broadcast via /peer-info */
  extraInfo: Record<string, string> = {};
  /** SSE clients — response objects kept alive for real-time events */
  private sseClients = new Set<ServerResponse>();

  // ── Queue state ──────────────────────────────────────────────
  private taskQueue: SwarmTask[] = [];
  private isBusyInternal = false;
  private currentTask: SwarmTask | null = null;
  private readonly maxQueueSize = 50;

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
  async start(peerInfo: PeerInfo): Promise<number> {
    if (this.started) return this.actualPort;
    this.currentPeerInfo = peerInfo;

    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => {
        this.handleHttpRequest(req, res);
      });

      this.server.on('upgrade', (req, socket, head) => {
        this.handleWebSocketUpgrade(req, socket, head);
      });

      this.server.on('error', err => {
        logForDebugging(`[PeerServer] Error: ${errorMessage(err)}`);
        reject(err);
      });

      // Listen on port 0 (OS picks a free port) on localhost only
      this.server.listen(0, '127.0.0.1', () => {
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
    // Close all WebSocket connections
    for (const ws of this.wsClients) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
    this.wsClients.clear();
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
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

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
   * Handle HTTP requests.
   */
  private handleHttpRequest(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const body: Buffer[] = [];

    req.on('data', (chunk: Buffer) => body.push(chunk));
    req.on('end', () => {
      try {
        switch (url.pathname) {
          case '/peer-info': {
            // Include queue status in peer info
            const info: Record<string, any> = {
              ...this.currentPeerInfo,
              ...this.extraInfo,
              isBusy: this.isBusyInternal,
              queueDepth: this.taskQueue.length,
            };
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(info));
            break;
          }

          case '/peer-events': {
            this.handleSSE(req, res);
            break;
          }

          case '/peer-msg': {
            const data = JSON.parse(Buffer.concat(body).toString());
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
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ stdout: '', stderr: errMsg, exitCode: 1 }));
              });
            break;
          }

          case '/peer-queue-status': {
            const { queue, current } = this.getTasks();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                isBusy: this.isBusyInternal,
                currentTask: current
                  ? {
                      id: current.id,
                      command: current.command,
                      from: current.from,
                      status: current.status,
                      priority: current.priority,
                      createdAt: current.createdAt,
                      startedAt: current.startedAt,
                    }
                  : null,
                queueDepth: this.taskQueue.length,
                queue: queue.map(t => ({
                  id: t.id,
                  command: t.command,
                  from: t.from,
                  status: t.status,
                  priority: t.priority,
                  createdAt: t.createdAt,
                })),
              }),
            );
            break;
          }

          case '/peer-queue-cancel': {
            const data = JSON.parse(Buffer.concat(body).toString());
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
            const count = this.cancelAllQueuedTasks();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, cancelled: count }));
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

  /**
   * Handle WebSocket upgrade for chat.
   */
  private handleWebSocketUpgrade(req: IncomingMessage, socket: any, head: Buffer): void {
    // Simple WebSocket upgrade without external library
    // For v1, chat will use HTTP POST /peer-msg (simpler, no WS needed)
    // WebSocket support can be added in a future iteration
    socket.destroy();
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
