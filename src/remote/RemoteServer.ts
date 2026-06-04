/**
 * RemoteServer — WebSocket server for provider-agnostic Remote Control.
 *
 * Listens for incoming connections, authenticates via one-time tokens,
 * creates sessions, and bridges SDK messages bidirectionally between
 * the local CLI session and the remote client.
 *
 * Endpoints:
 *   GET  /health         → health check
 *   POST /v1/sessions    → create a session (returns ws_url + session_id)
 *   GET  /ws             → WebSocket upgrade (requires Bearer auth)
 *
 * The /v1/sessions endpoint is called by the remote's
 * `createDirectConnectSession()` to get a WebSocket URL.
 * The /ws endpoint is the actual WebSocket bridge.
 */

import crypto from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { logForDebugging } from '../utils/debug.js';
import { errorMessage } from '../utils/errors.js';
import { consumeToken, generateToken } from './tokenStore.js';
import type { RemoteMessage, RemoteServerCallbacks, RemoteServerConfig, SessionInfo, SessionState } from './types.js';

const SESSION_TIMEOUT_CHECK_MS = 10_000; // check for stale sessions every 10s

export class RemoteServer {
  private server: ReturnType<typeof createServer> | null = null;
  private sessions = new Map<string, SessionInfo>();
  private wsClients = new Map<string, { send: (data: string) => void; close: () => void }>();
  private config: RemoteServerConfig;
  private callbacks: RemoteServerCallbacks;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private started = false;

  constructor(config: RemoteServerConfig, callbacks?: RemoteServerCallbacks) {
    this.config = config;
    this.callbacks = callbacks ?? {};
  }

  /**
   * Start the server. Resolves once the server is listening.
   * Returns the actual address (host + port).
   */
  async start(): Promise<{ host: string; port: number }> {
    if (this.started) throw new Error('RemoteServer already started');

    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => {
        this.handleHttpRequest(req, res);
      });

      // Handle WebSocket upgrades
      this.server.on('upgrade', (req, socket, head) => {
        void this.handleWebSocketUpgrade(req, socket, head);
      });

      this.server.on('error', (err: Error) => {
        logForDebugging(`[RemoteServer] Error: ${errorMessage(err)}`, { level: 'error' });
        this.callbacks.onError?.(err);
        reject(err);
      });

      this.server.listen(this.config.port, this.config.host, () => {
        const addr = this.server!.address() as AddressInfo;
        this.started = true;
        logForDebugging(`[RemoteServer] Listening on ${addr.address}:${addr.port}`);

        // Periodic session cleanup
        this.cleanupTimer = setInterval(() => this.reapStaleSessions(), SESSION_TIMEOUT_CHECK_MS);

        resolve({ host: addr.address, port: addr.port });
      });
    });
  }

  /**
   * Stop the server and close all sessions.
   */
  async stop(): Promise<void> {
    if (!this.started) return;

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Close all WebSocket clients
    for (const [id, client] of this.wsClients) {
      try {
        client.close();
      } catch { /* ignore */ }
    }
    this.wsClients.clear();

    // Close HTTP server
    return new Promise(resolve => {
      if (this.server) {
        this.server.close(() => {
          this.started = false;
          this.server = null;
          this.sessions.clear();
          logForDebugging('[RemoteServer] Stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Whether the server is currently running.
   */
  get running(): boolean {
    return this.started;
  }

  /**
   * Get the actual listening address (after start resolves).
   */
  get address(): { host: string; port: number } | null {
    if (!this.server) return null;
    const addr = this.server.address() as AddressInfo | null;
    if (!addr) return null;
    return { host: addr.address, port: addr.port };
  }

  /**
   * Get info about all current sessions.
   */
  getSessionInfos(): SessionInfo[] {
    return Array.from(this.sessions.values());
  }

  // ── HTTP request handler ────────────────────────────────────────────

  private handleHttpRequest(
    req: import('node:http').IncomingMessage,
    res: import('node:http').ServerResponse,
  ): void {
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';

    // CORS headers for browser-based clients
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // GET /health
    if (method === 'GET' && url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', sessions: this.sessions.size }));
      return;
    }

    // POST /v1/sessions
    if (method === 'POST' && url === '/v1/sessions') {
      void this.handleCreateSession(req, res);
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  }

  // ── Create session ──────────────────────────────────────────────────

  private async handleCreateSession(
    req: import('node:http').IncomingMessage,
    res: import('node:http').ServerResponse,
  ): Promise<void> {
    // Read auth header
    const auth = req.headers['authorization'] ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';

    if (!token) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing authorization header' }));
      return;
    }

    // Validate token
    const entry = consumeToken(token);
    if (!entry) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid or expired token' }));
      return;
    }

    // Check max sessions
    if (this.sessions.size >= this.config.maxSessions) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Max sessions reached' }));
      return;
    }

    const sessionId = `remote-${crypto.randomUUID().slice(0, 8)}`;
    const wsUrl = this.buildWsUrl(sessionId);

    // Read body for cwd etc.
    let body = '';
    try {
      for await (const chunk of req) {
        body += chunk;
      }
    } catch { /* ignore */ }

    let cwd = '';
    try {
      const parsed = JSON.parse(body);
      cwd = parsed.cwd ?? '';
    } catch { /* ignore */ }

    // Register session
    const session: SessionInfo = {
      id: sessionId,
      state: 'starting',
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    };
    this.sessions.set(sessionId, session);

    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        session_id: sessionId,
        ws_url: wsUrl,
        work_dir: cwd || undefined,
      }),
    );

    this.callbacks.onSessionStart?.(sessionId);
  }

  // ── WebSocket upgrade ───────────────────────────────────────────────

  private async handleWebSocketUpgrade(
    req: import('node:http').IncomingMessage,
    socket: import('node:net').Socket,
    head: Buffer,
  ): Promise<void> {
    // Validate auth token on upgrade
    const url = new URL(req.url ?? '/', 'http://localhost');
    const queryToken = url.searchParams.get('token');
    const authHeader = req.headers['authorization'] ?? '';
    const headerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const token = queryToken || headerToken;

    if (!token) {
      socket.destroy();
      return;
    }

    // Validate the token (don't consume — it was consumed at /v1/sessions)
    // For /ws we just check the session_id exists in our map
    const sessionId = queryToken; // actually not — we need session_id from the URL path
    // Parse session_id from path: /ws?session_id=xxx&token=yyy
    const sessionIdFromUrl = url.searchParams.get('session_id');

    // If there's a session_id, validate it exists
    if (sessionIdFromUrl && !this.sessions.has(sessionIdFromUrl)) {
      socket.destroy();
      return;
    }

    // Perform WebSocket upgrade
    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.destroy();
      return;
    }

    const accept = crypto
      .createHash('sha1')
      .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11', 'utf-8')
      .digest('base64');

    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n` +
        '\r\n',
    );

    // Create a simple WebSocket wrapper
    const client = this.createWsWrapper(socket);
    const wsId = sessionIdFromUrl || `anon-${crypto.randomUUID().slice(0, 8)}`;
    this.wsClients.set(wsId, client);

    // Update session state
    const session = this.sessions.get(wsId);
    if (session) {
      session.state = 'running';
      session.lastActivityAt = Date.now();
    }

    // Handle incoming messages
    let buffer = Buffer.alloc(0);
    socket.on('data', (data: Buffer) => {
      buffer = Buffer.concat([buffer, data]);
      const frames = this.parseWebSocketFrames(buffer);
      buffer = frames.remaining;

      for (const frame of frames.messages) {
        if (frame.opcode === 0x08) {
          // Close frame
          this.handleDisconnect(wsId);
          return;
        }
        if (frame.opcode === 0x01) {
          // Text frame
          const text = frame.payload.toString('utf-8');
          this.callbacks.onMessage?.(wsId, JSON.parse(text) as RemoteMessage);
        }
        if (frame.opcode === 0x09) {
          // Ping → pong
          socket.write(this.encodeWsFrame(0x0a, frame.payload));
        }
      }
    });

    socket.on('close', () => {
      this.handleDisconnect(wsId);
    });

    socket.on('error', () => {
      this.handleDisconnect(wsId);
    });
  }

  // ── Message sending (called by the host to push messages TO the remote) ──

  /**
   * Send a message to a connected remote client.
   */
  sendMessage(sessionId: string, message: RemoteMessage | string): boolean {
    const client = this.wsClients.get(sessionId);
    if (!client) return false;

    const data = typeof message === 'string' ? message : JSON.stringify(message);
    try {
      client.send(data);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Send a message to all connected clients (broadcast).
   */
  broadcast(message: RemoteMessage | string): number {
    const data = typeof message === 'string' ? message : JSON.stringify(message);
    let count = 0;
    for (const [id, client] of this.wsClients) {
      try {
        client.send(data);
        count++;
      } catch {
        this.handleDisconnect(id);
      }
    }
    return count;
  }

  // ── Helpers ─────────────────────────────────────────────────────────

  private buildWsUrl(sessionId: string): string {
    const addr = this.server!.address() as AddressInfo;
    const host = addr.address === '0.0.0.0' ? '127.0.0.1' : addr.address;
    return `ws://${host}:${addr.port}/ws?session_id=${sessionId}`;
  }

  private handleDisconnect(wsId: string): void {
    this.wsClients.delete(wsId);
    const session = this.sessions.get(wsId);
    if (session) {
      session.state = 'stopped';
      session.lastActivityAt = Date.now();
      this.callbacks.onSessionEnd?.(wsId);
    }
  }

  private reapStaleSessions(): void {
    if (this.config.idleTimeoutMs === 0) return;
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (session.state === 'stopped' && now - session.lastActivityAt > this.config.idleTimeoutMs) {
        this.sessions.delete(id);
        this.wsClients.delete(id);
      }
    }
  }

  // ── WebSocket frame helpers ─────────────────────────────────────────

  private createWsWrapper(socket: import('node:net').Socket): { send: (data: string) => void; close: () => void } {
    return {
      send: (data: string) => {
        if (socket.destroyed) return;
        const frame = this.encodeWsFrame(0x01, Buffer.from(data, 'utf-8'));
        socket.write(frame);
      },
      close: () => {
        try {
          if (!socket.destroyed) {
            socket.write(this.encodeWsFrame(0x08, Buffer.alloc(0)));
            socket.end();
          }
        } catch { /* ignore */ }
      },
    };
  }

  private encodeWsFrame(opcode: number, payload: Buffer): Buffer {
    const len = payload.length;
    const header: number[] = [0x80 | opcode];

    if (len < 126) {
      header.push(len);
    } else if (len < 65536) {
      header.push(126, (len >> 8) & 0xff, len & 0xff);
    } else {
      header.push(
        127,
        (len >> 56) & 0xff,
        (len >> 48) & 0xff,
        (len >> 40) & 0xff,
        (len >> 32) & 0xff,
        (len >> 24) & 0xff,
        (len >> 16) & 0xff,
        (len >> 8) & 0xff,
        len & 0xff,
      );
    }

    return Buffer.concat([Buffer.from(header), payload]);
  }

  private parseWebSocketFrames(buffer: Buffer): { messages: Array<{ opcode: number; payload: Buffer }>; remaining: Buffer } {
    const messages: Array<{ opcode: number; payload: Buffer }> = [];
    let offset = 0;

    while (offset + 2 <= buffer.length) {
      const byte0 = buffer[offset]!;
      const opcode = byte0 & 0x0f;
      const masked = (buffer[offset + 1]! & 0x80) !== 0;
      let len = buffer[offset + 1]! & 0x7f;
      let headerLen = 2;

      if (len === 126) {
        if (offset + 4 > buffer.length) break;
        len = buffer.readUInt16BE(offset + 2);
        headerLen = 4;
      } else if (len === 127) {
        if (offset + 10 > buffer.length) break;
        len = Number(buffer.readBigUInt64BE(offset + 2));
        headerLen = 10;
      }

      const maskLen = masked ? 4 : 0;
      if (offset + headerLen + maskLen + len > buffer.length) break;

      let payload = buffer.subarray(offset + headerLen + maskLen, offset + headerLen + maskLen + len);

      // Unmask
      if (masked) {
        const mask = buffer.subarray(offset + headerLen, offset + headerLen + maskLen);
        const unmasked = Buffer.alloc(len);
        for (let i = 0; i < len; i++) {
          unmasked[i] = payload[i]! ^ mask[i % 4]!;
        }
        payload = unmasked;
      }

      messages.push({ opcode, payload });

      // Control frames (opcode 0x08+) can appear mid-fragmentation
      if (opcode >= 0x08) {
        offset += headerLen + maskLen + len;
        continue;
      }

      offset += headerLen + maskLen + len;

      // For non-control frames, stop after first complete message (no fragmentation support needed for our use case)
      break;
    }

    return { messages, remaining: buffer.subarray(offset) };
  }
}
