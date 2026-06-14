import { z } from 'zod/v4';
import { getGlobalDiscovery } from '../../swarm/SwarmDiscovery.js';
import { getGlobalSwarmServer } from '../../swarm/SwarmServer.js';
import { getGlobalSwarmStore } from '../../swarm/SwarmStore.js';
import type { SwarmInfo } from '../../swarm/types.js';
import { buildTool } from '../../Tool.js';
import { getCwd } from '../../utils/cwd.js';
import { errorMessage } from '../../utils/errors.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { DESCRIPTION, SWARM_SHARE_TOOL_NAME, PROMPT } from './prompt.js';

const inputSchema = lazySchema(() =>
  z.object({
    action: z.enum(['start', 'stop', 'status']).describe('"start" to share, "stop" to stop, "status" to check'),
  }),
);

const outputSchema = lazySchema(() =>
  z.object({
    sharing: z.boolean().describe('Whether sharing is active'),
    port: z.number().optional().describe('Port the peer server is listening on'),
    peersDiscovered: z.number().optional().describe('Number of peers found during start'),
    message: z.string().describe('Status message'),
  }),
);

export type Output = z.infer<ReturnType<typeof outputSchema>>;

export const SwarmShareTool = buildTool({
  isConcurrencySafe() {
    return true;
  },
  isReadOnly() {
    return false;
  },
  name: SWARM_SHARE_TOOL_NAME,
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
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: output.sharing ? `Sharing (port ${output.port || '?'})` : 'Not sharing',
    };
  },
  async call(input: { action: 'start' | 'stop' | 'status' }) {
    const discovery = getGlobalDiscovery();
    const server = getGlobalSwarmServer();
    const isSharing = discovery.isSharing;

    if (input.action === 'status') {
      return { data: { sharing: isSharing, message: isSharing ? 'Sharing active' : 'Not sharing' } };
    }

    if (input.action === 'stop') {
      if (!isSharing) {
        return { data: { sharing: false, message: 'Already not sharing' } };
      }
      discovery.stopAdvertising();
      server.stop();
      return { data: { sharing: false, message: 'Stopped sharing' } };
    }

    // start
    if (isSharing) {
      return { data: { sharing: true, message: 'Already sharing' } };
    }

    try {
      const store = getGlobalSwarmStore();

      // Wire up callbacks so incoming messages/todos get stored locally
      server.setCallbacks({
        onMessage: msg => {
          store.addMessage(msg);
        },
        onTodo: todo => {
          store.addTodo(todo);
        },
      });

      // Wire up SwarmStore callbacks to broadcast SSE events
      store.setCallbacks({
        onPeerAdded: peer => {
          server.broadcastEvent('swarm_online', {
            id: peer.id,
            hostname: peer.hostname,
            port: swarm.port,
          });
        },
        onPeerRemoved: swarmId => {
          server.broadcastEvent('swarm_offline', { id: swarmId });
        },
      });

      const swarmInfo: SwarmInfo = {
        id: discovery.swarmId,
        hostname: discovery.hostname,
        ip: '127.0.0.1',
        port: 0,
        cwd: process.cwd(),
        version: '',
        lastSeen: Date.now(),
        status: 'online',
      };

      const port = await server.start(swarmInfo);
      swarmInfo.port = port;
      await discovery.startAdvertising(port, process.cwd());

      const peers = await discovery.discoverPeers(3000);
      for (const p of peers) store.addPeer(p);

      return { data: { sharing: true, port, peersDiscovered: peers.length, message: `Sharing on port ${port}` } };
    } catch (err) {
      return { data: { sharing: false, message: `Failed: ${errorMessage(err)}` } };
    }
  },
});
