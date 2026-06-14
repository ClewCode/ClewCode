/**
 * ACP WebSocket Server — WebSocket transport for editor ACP.
 *
 * Allows remote editors to connect to Clew Code ACP via WebSocket
 * instead of spawning clew as a subprocess. Each WS connection gets
 * its own AgentSideConnection with isolated sessions.
 *
 * Uses Bun.serve() for native WebSocket support.
 */

import { AgentSideConnection, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk';
import { AcpRunController } from '../../acp-agents/AcpRunController.js';
import { logForDebugging } from '../../utils/debug.js';
import type { ACPConfig } from './ACPConfig.js';
import { cleanupSessions, createSession, getSession, listSessions, removeSession } from './ACPSessionManager.js';
import { ACPStatusManager } from './ACPStatusManager.js';

type ConnectionState = {
  reader: ReadableStreamDefaultController<Uint8Array>;
  connection: AgentSideConnection;
  controller: AcpRunController;
};

export function startACPWebSocketServer(config: ACPConfig): void {
  const connections = new WeakMap<import('bun').ServerWebSocket, ConnectionState>();
  const statusMgr = ACPStatusManager.getInstance();

  statusMgr.update({
    isRunning: true,
    transport: 'websocket',
    port: config.port,
  });

  // Session cleanup timer
  const cleanupInterval = setInterval(() => {
    const removed = cleanupSessions(config.sessionMaxAgeMinutes);
    if (removed > 0) {
      logForDebugging(`[ACP-WS] Cleaned up ${removed} stale sessions`);
    }
  }, 60_000);

  const server = Bun.serve({
    port: config.port,
    hostname: config.host,
    fetch(req, srv) {
      if (srv.upgrade(req)) return;
      return new Response('Clew Code ACP WebSocket endpoint', { status: 200 });
    },
    websocket: {
      open(ws) {
        logForDebugging('[ACP-WS] Client connected');

        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        let readerCtrl!: ReadableStreamDefaultController<Uint8Array>;
        let closed = false;

        // Readable: receives NDJSON from WS messages
        const input = new ReadableStream<Uint8Array>({
          start(ctrl) {
            readerCtrl = ctrl;
          },
          cancel() {
            closed = true;
          },
        });

        // Writable: sends NDJSON to WS
        const output = new WritableStream<Uint8Array>({
          write(chunk) {
            if (!closed) {
              ws.sendText(decoder.decode(chunk));
            }
          },
          close() {
            if (!closed) {
              ws.close();
              closed = true;
            }
          },
        });

        const stream = ndJsonStream(output, input);
        const controller = new AcpRunController();

        const conn = new AgentSideConnection(
          conn => createWebSocketAgentHandler(config, conn, controller, statusMgr),
          stream,
        );

        connections.set(ws, { reader: readerCtrl, connection: conn, controller });
        statusMgr.incrementSessions();
      },

      message(ws, data) {
        const state = connections.get(ws);
        if (!state) return;
        const text = typeof data === 'string' ? data : new TextDecoder().decode(data);
        try {
          state.reader.enqueue(new TextEncoder().encode(text));
        } catch {
          // Reader may be closed/errored, ignore
        }
      },

      close(ws) {
        logForDebugging('[ACP-WS] Client disconnected');
        const state = connections.get(ws);
        if (state) {
          try {
            state.reader.close();
          } catch {
            // Already closed
          }
          connections.delete(ws);
          statusMgr.decrementSessions();
        }
      },
    },
  });

  logForDebugging(`[ACP-WS] Server listening on ws://${config.host}:${config.port}`);
  logForDebugging(`[ACP-WS] Protocol version: ${PROTOCOL_VERSION}`);

  // Track the server for cleanup
  process.on('SIGINT', () => {
    clearInterval(cleanupInterval);
    server.stop();
    statusMgr.reset();
  });
}

function createWebSocketAgentHandler(
  config: ACPConfig,
  connection: AgentSideConnection,
  controller: AcpRunController,
  statusMgr: ACPStatusManager,
): import('@agentclientprotocol/sdk').Agent {
  return {
    initialize: async params => {
      logForDebugging(`[ACP-WS] Initialize: protocolVersion=${params.protocolVersion}`);
      return {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {
          session: {
            new: true,
            prompt: true,
            cancel: true,
            close: true,
            list: true,
            delete: true,
            modes: true,
            set_config_option: true,
          },
          auth: config.authToken
            ? { methods: [{ id: 'token', label: 'Authentication Token', required: true }] }
            : undefined,
        },
        agentInfo: {
          name: 'Clew Code',
          version: '1.0.0',
        },
      };
    },

    authenticate: async _params => {
      logForDebugging('[ACP-WS] Authenticate');
      return {};
    },

    newSession: async params => {
      createSession(params.sessionId);
      statusMgr.incrementSessions();
      logForDebugging(`[ACP-WS] New session: ${params.sessionId}`);
      return {
        sessionId: params.sessionId,
        cwd: params.cwd ?? process.cwd(),
        availableModes: [
          { id: 'ask', label: 'Ask', description: 'Ask questions about code' },
          { id: 'code', label: 'Code', description: 'Write and edit code' },
        ],
      };
    },

    listSessions: async () => {
      const sessions = listSessions();
      return {
        sessions: sessions.map(s => ({
          sessionId: s.acpSessionId,
          cwd: process.cwd(),
          title: `ACP Session ${s.acpSessionId}`,
          updatedAt: new Date(s.lastActivityAt).toISOString(),
        })),
      };
    },

    deleteSession: async params => {
      if (removeSession(params.sessionId)) statusMgr.decrementSessions();
      logForDebugging(`[ACP-WS] Delete session: ${params.sessionId}`);
    },

    closeSession: async params => {
      if (removeSession(params.sessionId)) statusMgr.decrementSessions();
      logForDebugging(`[ACP-WS] Close session: ${params.sessionId}`);
    },

    setSessionMode: async params => {
      logForDebugging(`[ACP-WS] Set session mode: ${params.sessionId} -> ${params.mode}`);
      return {};
    },

    setSessionConfigOption: async params => {
      logForDebugging(`[ACP-WS] Set config option: ${params.sessionId} -> ${params.option}=${params.value}`);
      return { config: {} };
    },

    prompt: async params => {
      const session = getSession(params.sessionId);
      if (!session) {
        throw new Error(`Session not found: ${params.sessionId}`);
      }
      session.lastActivityAt = Date.now();

      const text = extractTextFromContentBlocks(params.prompt);
      logForDebugging(`[ACP-WS] Prompt: session=${params.sessionId}, text="${text.slice(0, 100)}..."`);

      const result = await controller.execute(params.sessionId, text, {
        providerId: config.meshProviderId,
        timeoutMs: 120_000,
      });

      const outputText = result.output || result.error || '(no output)';

      void connection.sessionUpdate({
        sessionId: params.sessionId,
        update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: outputText } },
      } as any);

      if (!result.ok && result.error !== 'Cancelled') {
        logForDebugging(`[ACP-WS] Prompt error: ${result.error}`);
      }

      const stopReason = result.error === 'Cancelled' ? 'cancelled' : 'end_turn';
      return { stopReason: stopReason as 'end_turn' | 'cancelled' };
    },

    cancel: async params => {
      logForDebugging(`[ACP-WS] Cancel: session=${params.sessionId}`);
      controller.cancel(params.sessionId);
    },

    loadSession: async params => {
      logForDebugging(`[ACP-WS] Load session: ${params.sessionId}`);
      return {
        sessionId: params.sessionId,
        cwd: process.cwd(),
        availableModes: [
          { id: 'ask', label: 'Ask', description: 'Ask questions about code' },
          { id: 'code', label: 'Code', description: 'Write and edit code' },
        ],
      };
    },

    logout: async () => {
      logForDebugging('[ACP-WS] Logout');
      return {};
    },
  };
}

function extractTextFromContentBlocks(blocks: any[]): string {
  return blocks
    .filter(b => b.type === 'text' || b.content_type === 'text/plain')
    .map(b => b.text ?? b.content ?? '')
    .join('\n');
}
