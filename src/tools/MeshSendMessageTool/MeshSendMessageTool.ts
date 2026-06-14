import * as React from 'react';
import { z } from 'zod/v4';
import { MessageResponse } from '../../components/MessageResponse.js';
import { Box, Text } from '../../ink.js';
import { getGlobalDiscovery } from '../../mesh/MeshDiscovery.js';
import { getGlobalMeshServer } from '../../mesh/MeshServer.js';
import { getGlobalMeshStore } from '../../mesh/MeshStore.js';
import type { MeshInfo } from '../../mesh/types.js';
import type { ValidationResult } from '../../Tool.js';
import { buildTool } from '../../Tool.js';
import { getCwd } from '../../utils/cwd.js';
import { errorMessage } from '../../utils/errors.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { notifyMeshFeedback, truncateText } from '../mesh/meshFeedback.js';
import { DESCRIPTION, MESH_SEND_MESSAGE_TOOL_NAME, PROMPT } from './prompt.js';

const inputSchema = lazySchema(() =>
  z.object({
    peer: z.string().describe('Hostname, peer ID, or port number of the target peer'),
    message: z.string().describe('Message text to send'),
    waitResponse: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        'If true, after sending, wait for a response message from the mesh node. ' +
          'Use instead of send-then-poll pattern.',
      ),
    responseTimeout: z
      .number()
      .optional()
      .default(60)
      .describe('Max seconds to wait for response when `waitResponse` is true (default: 60, max: 300).'),
    chunk: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        'If true, auto-split long messages into chunks and send sequentially. ' +
          'The receiver will see them as one reassembled message.',
      ),
    chunkSize: z
      .number()
      .optional()
      .default(1000)
      .describe('Max characters per chunk when `chunk` is true (default: 1000).'),
  }),
);

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean(),
    messageId: z.string().optional(),
    meshHostname: z.string().optional(),
    messageText: z.string().optional(),
    response: z
      .object({
        from: z.string(),
        fromName: z.string(),
        text: z.string(),
        timestamp: z.number(),
      })
      .optional()
      .describe('Response message from peer (only when waitResponse: true)'),
    timedOut: z.boolean().optional().describe('Whether response wait timed out'),
    chunksSent: z.number().optional().describe('Number of chunks sent when chunking'),
    chunkGroup: z.string().optional().describe('Chunk group ID when chunking was used'),
    totalChars: z.number().optional().describe('Total message characters when chunking'),
    chunkStatus: z.string().optional().describe('Chunk send verification status'),
    error: z.string().optional(),
  }),
);

export type Output = z.infer<ReturnType<typeof outputSchema>>;

export const MeshSendMessageTool = buildTool({
  isConcurrencySafe() {
    return true;
  },
  isReadOnly() {
    return false;
  },
  name: MESH_SEND_MESSAGE_TOOL_NAME,
  searchHint: 'send a chat message to a mesh node',
  maxResultSizeChars: 100_000,
  async description() {
    return DESCRIPTION;
  },
  async prompt() {
    return PROMPT;
  },
  get inputSchema() {
    return inputSchema();
  },
  get outputSchema() {
    return outputSchema();
  },
  getPath() {
    return getCwd();
  },
  userFacingName() {
    return 'MeshSendMessage';
  },
  renderToolUseMessage(input) {
    const preview = input.message ? ` "${truncateText(input.message, 60)}"` : '';
    return `to: ${input.peer}${preview}`;
  },
  renderToolResultMessage(output) {
    if (!output.success) {
      return React.createElement(
        MessageResponse,
        null,
        React.createElement(Text, { color: 'ansi:red' }, `Failed: ${output.error}`),
      );
    }
    const chunkStr = output.chunksSent ? ` (${output.chunksSent} chunks)` : '';
    const responseStr = output.response
      ? ` | Response from ${output.response.fromName}: "${truncateText(output.response.text, 80)}"`
      : '';
    return React.createElement(
      MessageResponse,
      null,
      React.createElement(Text, { dimColor: true }, `Sent to ${output.meshHostname}${chunkStr}${responseStr}`),
    );
  },
  async validateInput(input: any): Promise<ValidationResult> {
    if (!input.peer || typeof input.peer !== 'string' || input.peer.length < 1) {
      return { result: false, message: 'peer must be a non-empty hostname or peer ID', errorCode: 1 };
    }
    if (!input.message || typeof input.message !== 'string' || input.message.length < 1) {
      return { result: false, message: 'message must be a non-empty text', errorCode: 1 };
    }
    return { result: true };
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    if (!output.success)
      return { tool_use_id: toolUseID, type: 'tool_result', content: `[Mesh] Send failed: ${output.error}` };
    let content = `✓ sent to ${output.meshHostname}: "${truncateText(output.messageText, 120)}"`;
    if (output.chunksSent) {
      const st = output.chunkStatus ? ` | ${output.chunkStatus}` : '';
      content = `✓ sent to ${output.meshHostname}: ${output.chunksSent} chunks (${output.totalChars} chars total)${st}`;
    } else if (output.response) {
      const respText = output.response.text;
      if (respText.length > 500) {
        content = `✓ sent to ${output.meshHostname}: response (${respText.length} chars) ← ${output.response.fromName} (full text in output.response.text)`;
      } else {
        content = `✓ sent to ${output.meshHostname}: response ← ${output.response.fromName}: "${truncateText(respText, 240)}"`;
      }
    } else if (output.timedOut) {
      content = `✓ sent to ${output.meshHostname}: no response after wait`;
    }
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content,
    };
  },
  async call(input: {
    peer: string;
    message: string;
    waitResponse?: boolean;
    responseTimeout?: number;
    chunk?: boolean;
    chunkSize?: number;
  }) {
    const store = getGlobalMeshStore();
    const discovery = getGlobalDiscovery();
    const server = getGlobalMeshServer();

    notifyMeshFeedback(`sending message to ${input.peer}`, 'mesh-send', 'low');

    // Auto-start sharing if not already sharing
    if (!discovery.isSharing) {
      notifyMeshFeedback('starting peer sharing so the mesh node can reply', 'mesh-share-start', 'low');
      const meshInfo: MeshInfo = {
        id: discovery.meshId,
        hostname: discovery.hostname,
        ip: '127.0.0.1',
        port: 0,
        cwd: process.cwd(),
        version: '',
        lastSeen: Date.now(),
        status: 'online',
      };
      const port = await server.start(meshInfo);
      meshInfo.port = port;
      await discovery.startAdvertising(port, process.cwd());
    }

    let peer: MeshInfo | undefined;

    const portNum = parseInt(input.peer, 10);
    if (!isNaN(portNum)) {
      peer = store.getMeshByPort(portNum);
    }

    if (!peer) peer = store.findMesh(input.peer);

    if (!peer) {
      const discovery = getGlobalDiscovery();
      notifyMeshFeedback(`looking for ${input.peer}`, 'mesh-send-lookup', 'low');
      const peers = await discovery.discoverMeshs(3000);
      for (const p of peers) store.addMesh(p);
      peer = store.findMesh(input.peer);
      if (!peer && !isNaN(portNum)) peer = store.getMeshByPort(portNum);
    }

    if (!peer) {
      const message = `Mesh "${input.peer}" not found. Run mesh_discover first.`;
      notifyMeshFeedback(message, 'mesh-send-not-found', 'high');
      return {
        data: {
          success: false,
          error: message,
        },
      };
    }

    // Resolve our own identity so the receiving peer knows exactly who we are
    const myHostname = discovery.hostname;
    const myMeshId = discovery.meshId;
    const myPort = server.port;
    const myTags = store.getMeshTags(myMeshId);
    const myDisplayName = myTags?.displayName;
    const myRole = myTags?.role;
    // fromName = display name or hostname, with role suffix
    const myFromName = myDisplayName || myHostname;

    // Build the base identity block included in every POST
    const identityBody = {
      from: myHostname,
      fromName: myFromName,
      senderRole: myRole,
      senderPort: myPort,
    };

    const sendTimestamp = Date.now();
    const url = `http://${peer.ip || '127.0.0.1'}:${mesh.port}/mesh-msg`;

    // Helper to POST a single message (or chunk) to the mesh node
    const postMessage = async (
      body: Record<string, unknown>,
    ): Promise<{ ok: boolean; id?: string; error?: string }> => {
      try {
        notifyMeshFeedback('posting message to peer', 'mesh-send-post', 'low');
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
        const data = await res.json();
        return { ok: true, id: data.id };
      } catch (err) {
        return { ok: false, error: errorMessage(err) };
      }
    };

    // ── Chunked send ──────────────────────────────────────
    if (input.chunk && input.message.length > (input.chunkSize ?? 1000)) {
      const chunkSize = Math.max(100, input.chunkSize ?? 1000);
      const totalChars = input.message.length;
      const chunks: string[] = [];
      for (let i = 0; i < totalChars; i += chunkSize) {
        chunks.push(input.message.slice(i, i + chunkSize));
      }
      const chunkGroup = `chunk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const total = chunks.length;

      for (let i = 0; i < total; i++) {
        notifyMeshFeedback(`sending chunk ${i + 1}/${total}`, 'mesh-send-chunk', 'low');
        const result = await postMessage({
          ...identityBody,
          text: chunks[i],
          chunkGroup,
          chunkIndex: i,
          chunkTotal: total,
        });
        if (!result.ok) {
          const message = `Chunk ${i + 1}/${total} failed: ${result.error}`;
          notifyMeshFeedback(message, 'mesh-send-error', 'high');
          return { data: { success: false, error: message } };
        }
        // Record each chunk locally
        store.addMessage({
          id: result.id ?? `msg_${Date.now()}_local_${i}`,
          from: 'local',
          fromName: 'Me',
          text: `→ ${peer.hostname} [chunk ${i + 1}/${total}]: ${chunks[i]!.slice(0, 60)}...`,
          color: 'grey',
          timestamp: Date.now(),
          chunkGroup,
          chunkIndex: i,
          chunkTotal: total,
        });
      }

      // Verify all chunks recorded locally
      let chunkStatus = '';
      const status = store.getChunkGroupStatus(chunkGroup);
      if (status) {
        if (status.received >= status.expected) {
          chunkStatus = `✓ ${status.received}/${status.expected} chunks sent`;
        } else {
          chunkStatus = `⚠ ${status.received}/${status.expected} chunks recorded (missing ${status.expected - status.received})`;
        }
      }

      // If waitResponse, wait after all chunks sent
      if (input.waitResponse) {
        const timeoutMs = Math.min(Math.max(1, input.responseTimeout ?? 60), 300) * 1000;
        notifyMeshFeedback(`waiting up to ${Math.round(timeoutMs / 1000)}s for a response`, 'mesh-send-wait', 'low');
        const responses = await store.waitForMessageFrom(sendTimestamp, timeoutMs, peer.hostname);
        if (responses.length > 0) {
          const resp = responses[0]!;
          return {
            data: {
              success: true,
              meshHostname: peer.hostname,
              messageText: input.message.slice(0, 80),
              response: {
                from: resp.from,
                fromName: resp.fromName,
                text: resp.text,
                timestamp: resp.timestamp,
              },
              chunksSent: total,
              chunkGroup,
              totalChars,
            },
          };
        }
        return {
          data: {
            success: true,
            meshHostname: peer.hostname,
            messageText: input.message.slice(0, 80),
            timedOut: true,
            chunksSent: total,
            chunkGroup,
            totalChars,
            chunkStatus,
          },
        };
      }

      return {
        data: {
          success: true,
          meshHostname: peer.hostname,
          messageText: input.message.slice(0, 80),
          chunksSent: total,
          chunkGroup,
          totalChars,
        },
      };
    }

    // ── Single message send ───────────────────────────────
    const result = await postMessage({
      ...identityBody,
      text: input.message,
    });

    if (!result.ok) {
      const message = `Mesh ${peer.hostname} responded with HTTP ${result.error}`;
      notifyMeshFeedback(message, 'mesh-send-error', 'high');
      return { data: { success: false, error: message } };
    }
    notifyMeshFeedback(`sent to ${peer.hostname}`, 'mesh-send-result', 'medium');

    store.addMessage({
      id: result.id ?? `msg_${Date.now()}_local`,
      from: 'local',
      fromName: 'Me',
      text: `→ ${peer.hostname}: ${input.message}`,
      color: 'grey',
      timestamp: Date.now(),
    });

    // If waitResponse, wait for a message from the specific peer
    if (input.waitResponse) {
      const timeoutMs = Math.min(Math.max(1, input.responseTimeout ?? 60), 300) * 1000;
      notifyMeshFeedback(`waiting up to ${Math.round(timeoutMs / 1000)}s for a response`, 'mesh-send-wait', 'low');
      const responses = await store.waitForMessageFrom(sendTimestamp, timeoutMs, peer.hostname);
      if (responses.length > 0) {
        const resp = responses[0]!;
        return {
          data: {
            success: true,
            messageId: result.id,
            meshHostname: peer.hostname,
            messageText: input.message,
            response: {
              from: resp.from,
              fromName: resp.fromName,
              text: resp.text,
              timestamp: resp.timestamp,
            },
            timedOut: false,
          },
        };
      }

      // Timed out waiting
      return {
        data: {
          success: true,
          messageId: result.id,
          meshHostname: peer.hostname,
          messageText: input.message,
          timedOut: true,
        },
      };
    }

    return { data: { success: true, messageId: result.id, meshHostname: peer.hostname, messageText: input.message } };
  },
});
