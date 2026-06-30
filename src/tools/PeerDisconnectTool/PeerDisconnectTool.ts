import { z } from 'zod/v4';
import { getGlobalPeerStore } from '../../peer/PeerStore.js';
import type { ValidationResult } from '../../Tool.js';
import { buildTool } from '../../Tool.js';
import { getCwd } from '../../utils/cwd.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { notifyPeerFeedback } from '../peer/peerFeedback.js';
import { DESCRIPTION, PEER_DISCONNECT_TOOL_NAME, PROMPT } from './prompt.js';

const inputSchema = lazySchema(() =>
  z.object({
    peer: z.string().describe('Hostname, peer ID, or port number to disconnect'),
  }),
);

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean(),
    hostname: z.string().optional(),
    error: z.string().optional(),
  }),
);

export type Output = z.infer<ReturnType<typeof outputSchema>>;

export const PeerDisconnectTool = buildTool({
  isConcurrencySafe() {
    return true;
  },
  isReadOnly() {
    return false;
  },
  name: PEER_DISCONNECT_TOOL_NAME,
  searchHint: 'disconnect a peer node',
  maxResultSizeChars: 1_000,
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
    return { result: true };
  },
  renderToolUseMessage(input) {
    return `disconnect peer ${input.peer}`;
  },
  renderToolResultMessage(output) {
    return output.success ? `Disconnected ${output.hostname}.` : `Failed to disconnect peer: ${output.error}`;
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    if (!output.success)
      return { tool_use_id: toolUseID, type: 'tool_result', content: `[Peer] Failed: ${output.error}` };
    return { tool_use_id: toolUseID, type: 'tool_result', content: `✗ disconnected ${output.hostname}` };
  },
  async call(input: { peer: string }) {
    const store = getGlobalPeerStore();
    notifyPeerFeedback(`disconnecting ${input.peer}`, 'peer-disconnect', 'low');
    let peer = store.findPeer(input.peer);

    const portNum = parseInt(input.peer, 10);
    if (!peer && !Number.isNaN(portNum)) peer = store.getPeerByPort(portNum);

    if (!peer) {
      notifyPeerFeedback(`peer not found: ${input.peer}`, 'peer-disconnect-result', 'high');
      return { data: { success: false, error: `Peer "${input.peer}" not found` } };
    }

    store.removeMesh(peer.id);
    notifyPeerFeedback(`disconnected ${peer.hostname}`, 'peer-disconnect-result', 'medium');
    return { data: { success: true, hostname: peer.hostname } };
  },
});
