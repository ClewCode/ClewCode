/**
 * PeerServer — Lightweight HTTP + WebSocket server for peer-to-peer communication.
 *
 * Each peer that runs "/peer share" starts a PeerServer on a random port.
 * - GET /peer-info → JSON with current peer info
 * - POST /peer-msg → accept message from another peer (triggers callback)
 * - POST /peer-todo → accept todo from another peer
 * - WebSocket /peer-chat → real-time chat between two peers
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { logForDebugging } from '../utils/debug.js';
import { errorMessage } from '../utils/errors.js';
import { type PeerChatMessage, type PeerColor, type PeerInfo, type PeerTodo, peerColorFromId } from './types.js';

export type PeerServerCallbacks = {
  onMessage?: (msg: PeerChatMessage) => void;
  onTodo?: (todo: PeerTodo) => void;
  onExec?: (command: string) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  onChatConnected?: (peerName: string, color: PeerColor) => void;
  onChatDisconnected?: (peerName: string) => void;
};

export type PeerEventType = 'new_message' | 'new_todo' | 'peer_online' | 'peer_offline';

export type PeerEvent = {
  type: PeerEventType;
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
  private todos: PeerTodo[] = [];
  /** Extra metadata broadcast via /peer-info */
  extraInfo: Record<string, string> = {};
  /** SSE clients — response objects kept alive for real-time events */
  private sseClients = new Set<ServerResponse>();

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
  getTodos(): PeerTodo[] {
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

  // ── SSE (Server-Sent Events) ──────────────────────────────

  /**
   * Send an event to all connected SSE clients.
   */
  private broadcastSSE(event: PeerEvent): void {
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

    // Send initial connection event
    res.write(`event: connected\ndata: {"status":"ok"}\n\n`);

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
  broadcastEvent(type: PeerEventType, data: any): void {
    this.broadcastSSE({ type, data, timestamp: Date.now() });
  }

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
            const info = { ...this.currentPeerInfo, ...this.extraInfo };
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
            const msg: PeerChatMessage = {
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
            const todo: PeerTodo = {
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
            if (this.callbacks.onExec) {
              this.callbacks
                .onExec(data.command ?? '')
                .then(result => {
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify(result));
                })
                .catch(err => {
                  res.writeHead(500, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ stdout: '', stderr: errorMessage(err), exitCode: 1 }));
                });
            } else {
              res.writeHead(501, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ stdout: '', stderr: 'Exec not supported', exitCode: 1 }));
            }
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
