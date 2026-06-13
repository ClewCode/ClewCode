/**
 * ACP Server — Implements the Agent side of the Agent Client Protocol (ACP).
 *
 * ACP is a JSON-RPC based protocol that standardizes communication between
 * code editors (IDEs, text editors) and coding agents. This module allows
 * Clew Code to act as an ACP-compatible agent that editors like Zed can
 * connect to.
 *
 * Protocol spec: https://agentclientprotocol.com/protocol/v1/overview
 */

import { Writable } from 'node:stream';
import type { Agent } from '@agentclientprotocol/sdk';
import { AgentSideConnection, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk';
import { getProcessPeerProvider } from '../../peer/ProcessPeerProvider.js';
import { logForDebugging } from '../../utils/debug.js';
import type { ACPConfig } from './ACPConfig.js';
import { cleanupSessions, createSession, getSession, listSessions, removeSession } from './ACPSessionManager.js';
import { ACPStatusManager } from './ACPStatusManager.js';

/**
 * Start an ACP server that listens on stdio for JSON-RPC messages.
 *
 * This is the primary mode for ACP — editors spawn Clew Code as a subprocess
 * and communicate via stdio using newline-delimited JSON.
 *
 * @param config - ACP configuration
 */
export function startACPStdioServer(config: ACPConfig): void {
  const input = Bun.stdin.stream() as ReadableStream<Uint8Array>;
  const output = Writable.toWeb(process.stdout) as WritableStream<Uint8Array>;

  const { readable, writable } = ndJsonStream(output, input);
  const stream = { readable, writable };

  const connection = new AgentSideConnection(conn => createAgentHandler(config, conn), stream);

  // Track status
  const statusMgr = ACPStatusManager.getInstance();
  statusMgr.update({
    isRunning: true,
    transport: config.transport,
    port: config.transport === 'websocket' ? config.port : null,
  });

  logForDebugging('[ACP] Server started (stdio mode)');
  logForDebugging(`[ACP] Protocol version: ${PROTOCOL_VERSION}`);

  // Start session cleanup timer
  const cleanupInterval = setInterval(() => {
    const removed = cleanupSessions(config.sessionMaxAgeMinutes);
    if (removed > 0) {
      logForDebugging(`[ACP] Cleaned up ${removed} stale sessions`);
    }
  }, 60_000);

  connection.closed.then(() => {
    clearInterval(cleanupInterval);
    statusMgr.reset();
    logForDebugging('[ACP] Connection closed');
  });
}

/**
 * Create an Agent handler for ACP.
 *
 * @param config - ACP configuration
 * @returns Agent implementation
 */
function createAgentHandler(config: ACPConfig, connection: AgentSideConnection): Agent {
  return {
    initialize: async params => {
      logForDebugging(`[ACP] Initialize: protocolVersion=${params.protocolVersion}`);

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
      logForDebugging('[ACP] Authenticate');
      return {};
    },

    newSession: async params => {
      const _session = createSession(params.sessionId);
      statusMgr.incrementSessions();
      logForDebugging(`[ACP] New session: ${params.sessionId} (cwd: ${params.cwd ?? process.cwd()})`);

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
      logForDebugging(`[ACP] Delete session: ${params.sessionId}`);
    },

    closeSession: async params => {
      if (removeSession(params.sessionId)) statusMgr.decrementSessions();
      logForDebugging(`[ACP] Close session: ${params.sessionId}`);
    },

    setSessionMode: async params => {
      logForDebugging(`[ACP] Set session mode: ${params.sessionId} -> ${params.mode}`);
      return {};
    },

    setSessionConfigOption: async params => {
      logForDebugging(`[ACP] Set config option: ${params.sessionId} -> ${params.option}=${params.value}`);
      return { config: {} };
    },

    prompt: async params => {
      const session = getSession(params.sessionId);
      if (!session) {
        throw new Error(`Session not found: ${params.sessionId}`);
      }
      session.lastActivityAt = Date.now();

      const text = extractTextFromContentBlocks(params.prompt);
      logForDebugging(`[ACP] Prompt: session=${params.sessionId}, text="${text.slice(0, 100)}..."`);

      // Send initial update notification
      void connection.sessionUpdate({
        sessionId: params.sessionId,
        content: [],
        status: 'in_progress',
      });

      // Execute via Codex process peer
      const provider = getProcessPeerProvider('codex');
      if (provider) {
        try {
          const result = await provider.runTask({
            prompt: text,
            timeoutMs: 120_000,
          });

          const outputText = result.stdout?.trim() || result.stderr?.trim() || '(no output)';
          const exitCode = result.exitCode ?? 0;

          // Send final update
          void connection.sessionUpdate({
            sessionId: params.sessionId,
            content: [
              {
                type: 'text',
                text: outputText,
              },
            ],
            status: 'completed',
          });

          if (exitCode !== 0) {
            logForDebugging(`[ACP] Prompt completed with exit code ${exitCode}`);
          }

          return {
            stopReason: 'end_turn',
            messages: [
              {
                role: 'assistant',
                parts: [
                  {
                    content_type: 'text/plain',
                    content: outputText,
                  },
                ],
              },
            ],
          };
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          logForDebugging(`[ACP] Prompt execution error: ${errMsg}`);

          void connection.sessionUpdate({
            sessionId: params.sessionId,
            content: [
              {
                type: 'text',
                text: `Error: ${errMsg}`,
              },
            ],
            status: 'completed',
          });

          return {
            stopReason: 'error',
            error: { type: 'internal_error', message: errMsg },
            messages: [
              {
                role: 'assistant',
                parts: [
                  {
                    content_type: 'text/plain',
                    content: `Error executing prompt: ${errMsg}`,
                  },
                ],
              },
            ],
          };
        }
      }

      // Fallback: no Codex provider available
      void connection.sessionUpdate({
        sessionId: params.sessionId,
        content: [
          {
            type: 'text',
            text: 'Codex provider not available. Install Codex CLI or use a different provider.',
          },
        ],
        status: 'completed',
      });

      return {
        stopReason: 'end_turn',
        messages: [
          {
            role: 'assistant',
            parts: [
              {
                content_type: 'text/plain',
                content: 'Codex provider not available. Install Codex CLI to execute tasks.',
              },
            ],
          },
        ],
      };
    },

    cancel: async _params => {
      logForDebugging('[ACP] Cancel');
      // TODO: abort current execution
    },

    loadSession: async params => {
      logForDebugging(`[ACP] Load session: ${params.sessionId}`);
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
      logForDebugging('[ACP] Logout');
      return {};
    },
  };
}

/**
 * Extract text content from ACP content blocks.
 * ACP prompts contain an array of content blocks (text, image, tool_use, etc.).
 */
function extractTextFromContentBlocks(blocks: any[]): string {
  return blocks
    .filter(b => b.type === 'text' || b.content_type === 'text/plain')
    .map(b => b.text ?? b.content ?? '')
    .join('\n');
}
