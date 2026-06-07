import { z } from 'zod/v4';
import { buildTool } from '../../Tool.js';
import type { ValidationResult } from '../../Tool.js';
import { getGlobalPeerStore } from '../../peer/PeerStore.js';
import { getGlobalDiscovery } from '../../peer/PeerDiscovery.js';
import { getCwd } from '../../utils/cwd.js';
import { errorMessage } from '../../utils/errors.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { DESCRIPTION, PEER_SEND_MESSAGE_TOOL_NAME, PROMPT } from './prompt.js';

const inputSchema = lazySchema(() =>
  z.object({
    peer: z.string().describe('Hostname, peer ID, or port number of the target peer'),
    message: z.string().describe('Message text to send'),
  }),
);

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean(),
    messageId: z.string().optional(),
    peerHostname: z.string().optional(),
    messageText: z.string().optional(),
    error: z.string().optional(),
  }),
);

export type Output = z.infer<ReturnType<typeof outputSchema>>;

export const PeerSendMessageTool = buildTool({
  isConcurrencySafe() {
    return true;
  },
  isReadOnly() {
    return false;
  },
  name: PEER_SEND_MESSAGE_TOOL_NAME,
  searchHint: 'send a chat message to a peer',
  maxResultSizeChars: 2_000,
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
    if (!output.success) return { tool_use_id: toolUseID, type: 'tool_result', content: `[Peer] Failed: ${output.error}` };
    return { tool_use_id: toolUseID, type: 'tool_result', content: `Sent to ${output.peerHostname}: "${output.messageText ?? ''}"` };
  },
  async call(input: { peer: string; message: string }) {
    const store = getGlobalPeerStore();
    let peer: PeerInfo | undefined;

    const portNum = parseInt(input.peer, 10);
    if (!isNaN(portNum)) {
      peer = store.getPeerByPort(portNum);
    }

    if (!peer) peer = store.findPeer(input.peer);

    if (!peer) {
      const discovery = getGlobalDiscovery();
      const peers = await discovery.discoverPeers(3000);
      for (const p of peers) store.addPeer(p);
      peer = store.findPeer(input.peer);
      if (!peer && !isNaN(portNum)) peer = store.getPeerByPort(portNum);
    }

    if (!peer) {
      return {
        data: {
          success: false,
          error: `Peer "${input.peer}" not found. Run peer_discover first.`,
        },
      };
    }

    try {
      const url = `http://${peer.ip}:${peer.port}/peer-msg`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'ai-agent', fromName: 'Clew AI', text: input.message }),
      });

      if (!response.ok) {
        return { data: { success: false, error: `Peer ${peer.hostname} responded with HTTP ${response.status}` } };
      }

      const result = await response.json();
      store.addMessage({
        id: result.id ?? `msg_${Date.now()}_local`,
        from: 'local',
        fromName: 'Me',
        text: `→ ${peer.hostname}: ${input.message}`,
        color: 'grey',
        timestamp: Date.now(),
      });

      return { data: { success: true, messageId: result.id, peerHostname: peer.hostname, messageText: input.message } };
    } catch (err) {
      return { data: { success: false, error: `Failed: ${errorMessage(err)}` } };
    }
  },
});
