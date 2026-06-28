import { z } from 'zod/v4';
import { getGlobalDiscovery } from '../../peer/PeerDiscovery.js';
import { getGlobalPeerServer } from '../../peer/PeerServer.js';
import { getGlobalPeerStore } from '../../peer/PeerStore.js';
import type { PeerInfo } from '../../peer/types.js';
import { buildTool } from '../../Tool.js';
import { getCwd } from '../../utils/cwd.js';
import { errorMessage } from '../../utils/errors.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { notifyPeerFeedback } from '../peer/peerFeedback.js';
import { DESCRIPTION, PEER_SHARE_TOOL_NAME, PROMPT } from './prompt.js';

const inputSchema = lazySchema(() =>
  z.object({
    action: z
      .enum(['start', 'stop', 'status'])
      .optional()
      .default('status')
      .describe('"start" to share, "stop" to stop, "status" to check'),
  }),
);

const outputSchema = lazySchema(() =>
  z.object({
    sharing: z.boolean().describe('Whether sharing is active'),
    port: z.number().optional().describe('Port the peer node server is listening on'),
    peersDiscovered: z.number().optional().describe('Number of peers found during start'),
    message: z.string().describe('Status message'),
  }),
);

export type Output = z.infer<ReturnType<typeof outputSchema>>;

export const PeerShareTool = buildTool({
  isConcurrencySafe() {
    return true;
  },
  isReadOnly() {
    return false;
  },
  name: PEER_SHARE_TOOL_NAME,
  searchHint: 'start or stop peer sharing',
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
  renderToolUseMessage(input) {
    const action = input.action ?? 'status';
    return `${action} peer sharing`;
  },
  renderToolResultMessage(output) {
    return output.sharing ? `Peer sharing active${output.port ? ` on port ${output.port}` : ''}.` : output.message;
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: output.sharing ? `Sharing (port ${output.port || '?'})` : 'Not sharing',
    };
  },
  async call(input: { action?: 'start' | 'stop' | 'status' }) {
    const discovery = getGlobalDiscovery();
    const server = getGlobalPeerServer();
    const isSharing = discovery.isSharing;
    const action = input.action ?? 'status';
    notifyPeerFeedback(`${action} peer sharing`, 'peer-share', 'low');

    if (action === 'status') {
      return { data: { sharing: isSharing, message: isSharing ? 'Sharing active' : 'Not sharing' } };
    }

    if (action === 'stop') {
      if (!isSharing) {
        return { data: { sharing: false, message: 'Already not sharing' } };
      }
      discovery.stopAdvertising();
      server.stop();
      notifyPeerFeedback('peer sharing stopped', 'peer-share-result', 'medium');
      return { data: { sharing: false, message: 'Stopped sharing' } };
    }

    // start
    if (isSharing) {
      return { data: { sharing: true, message: 'Already sharing' } };
    }

    try {
      const store = getGlobalPeerStore();

      // Wire up callbacks so incoming messages/todos get stored locally
      server.setCallbacks({
        onMessage: msg => {
          store.addMessage(msg);
        },
        onTodo: todo => {
          store.addTodo(todo);
        },
      });

      // Wire up PeerStore callbacks to broadcast SSE events
      store.setCallbacks({
        onMeshAdded: peer => {
          server.broadcastEvent('peer_online', {
            id: peer.id,
            hostname: peer.hostname,
            port: peer.port,
          });
        },
        onMeshRemoved: peerId => {
          server.broadcastEvent('peer_offline', { id: peerId });
        },
      });

      const peerInfo: PeerInfo = {
        id: discovery.peerId,
        hostname: discovery.hostname,
        ip: '127.0.0.1',
        port: 0,
        cwd: process.cwd(),
        version: '',
        lastSeen: Date.now(),
        status: 'online',
      };

      const port = await server.start(peerInfo);
      peerInfo.port = port;
      await discovery.startAdvertising(port, process.cwd(), undefined, undefined, server.token);

      notifyPeerFeedback(`sharing on port ${port}; discovering peers`, 'peer-share-discover', 'low');
      const peers = await discovery.discoverPeers(3000);
      for (const p of peers) store.addPeer(p);
      store.populateTokensFromDiscovery(discovery);

      notifyPeerFeedback(`sharing on port ${port}; found ${peers.length} peer(s)`, 'peer-share-result', 'medium');
      return { data: { sharing: true, port, peersDiscovered: peers.length, message: `Sharing on port ${port}` } };
    } catch (err) {
      const message = `Failed: ${errorMessage(err)}`;
      notifyPeerFeedback(message, 'peer-share-error', 'high');
      return { data: { sharing: false, message } };
    }
  },
});
