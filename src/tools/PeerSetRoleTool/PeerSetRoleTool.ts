import { z } from 'zod/v4';
import { getGlobalDiscovery } from '../../peer/PeerDiscovery.js';
import { getGlobalPeerStore } from '../../peer/PeerStore.js';
import { buildTool } from '../../Tool.js';
import { getCwd } from '../../utils/cwd.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { notifyPeerFeedback } from '../peer/peerFeedback.js';
import { DESCRIPTION, PEER_SET_ROLE_TOOL_NAME, PROMPT } from './prompt.js';

const inputSchema = lazySchema(() =>
  z.object({
    worker: z.string().describe('Hostname or peer ID of the worker'),
    role: z.string().describe('Role for this worker (builder, tester, deployer, monitor, etc.)'),
  }),
);

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean(),
    workerHostname: z.string().optional(),
    role: z.string().optional(),
    error: z.string().optional(),
  }),
);

export type Output = z.infer<ReturnType<typeof outputSchema>>;

export const PeerSetRoleTool = buildTool({
  isConcurrencySafe() {
    return true;
  },
  isReadOnly() {
    return false;
  },
  name: PEER_SET_ROLE_TOOL_NAME,
  searchHint: 'set peer role',
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
  renderToolUseMessage(input) {
    return `set peer role for ${input.worker} to "${input.role}"`;
  },
  renderToolResultMessage(output) {
    return output.success
      ? `Set ${output.workerHostname ?? 'peer'} role to "${output.role}".`
      : `Failed to set peer role: ${output.error}`;
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    if (!output.success)
      return { tool_use_id: toolUseID, type: 'tool_result', content: `[Peer] Failed: ${output.error}` };
    return { tool_use_id: toolUseID, type: 'tool_result', content: `✓ role: ${output.role}` };
  },
  async call(input: { worker: string; role: string }) {
    const store = getGlobalPeerStore();
    const discovery = getGlobalDiscovery();
    notifyPeerFeedback(`setting peer role for ${input.worker}`, 'peer-set-role', 'low');

    if (input.worker === 'me' || input.worker === 'self') {
      store.setPeerRole(discovery.peerId, input.role);
      const { getGlobalPeerServer } = await import('../../peer/PeerServer.js');
      const server = getGlobalPeerServer();
      server.extraInfo.role = input.role;
      notifyPeerFeedback(`set self role to ${input.role}`, 'peer-set-role-result', 'medium');
      return { data: { success: true, workerHostname: 'self', role: input.role } };
    }

    let peer = store.findPeer(input.worker);
    if (!peer) {
      const peers = await discovery.discoverPeers(3000);
      for (const p of peers) store.addPeer(p);
      store.populateTokensFromDiscovery(discovery);
      peer = store.findPeer(input.worker);
    }
    if (!peer) {
      notifyPeerFeedback(`worker not found: ${input.worker}`, 'peer-set-role-result', 'high');
      return { data: { success: false, error: `Worker "${input.worker}" not found` } };
    }
    store.setPeerRole(peer.id, input.role);
    notifyPeerFeedback(`set ${peer.hostname} role to ${input.role}`, 'peer-set-role-result', 'medium');
    return { data: { success: true, workerHostname: peer.hostname, role: input.role } };
  },
});
