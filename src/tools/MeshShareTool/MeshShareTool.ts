import { z } from 'zod/v4';
import { getGlobalDiscovery } from '../../mesh/MeshDiscovery.js';
import { getGlobalMeshServer } from '../../mesh/MeshServer.js';
import { getGlobalMeshStore } from '../../mesh/MeshStore.js';
import type { MeshInfo } from '../../mesh/types.js';
import { buildTool } from '../../Tool.js';
import { getCwd } from '../../utils/cwd.js';
import { errorMessage } from '../../utils/errors.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { DESCRIPTION, MESH_SHARE_TOOL_NAME, PROMPT } from './prompt.js';

const inputSchema = lazySchema(() =>
  z.object({
    action: z.enum(['start', 'stop', 'status']).describe('"start" to share, "stop" to stop, "status" to check'),
  }),
);

const outputSchema = lazySchema(() =>
  z.object({
    sharing: z.boolean().describe('Whether sharing is active'),
    port: z.number().optional().describe('Port the mesh node server is listening on'),
    peersDiscovered: z.number().optional().describe('Number of peers found during start'),
    message: z.string().describe('Status message'),
  }),
);

export type Output = z.infer<ReturnType<typeof outputSchema>>;

export const MeshShareTool = buildTool({
  isConcurrencySafe() {
    return true;
  },
  isReadOnly() {
    return false;
  },
  name: MESH_SHARE_TOOL_NAME,
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
    const server = getGlobalMeshServer();
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
      const store = getGlobalMeshStore();

      // Wire up callbacks so incoming messages/todos get stored locally
      server.setCallbacks({
        onMessage: msg => {
          store.addMessage(msg);
        },
        onTodo: todo => {
          store.addTodo(todo);
        },
      });

      // Wire up MeshStore callbacks to broadcast SSE events
      store.setCallbacks({
        onMeshAdded: peer => {
          server.broadcastEvent('mesh_online', {
            id: peer.id,
            hostname: peer.hostname,
            port: mesh.port,
          });
        },
        onMeshRemoved: meshId => {
          server.broadcastEvent('mesh_offline', { id: meshId });
        },
      });

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

      const peers = await discovery.discoverMeshs(3000);
      for (const p of peers) store.addMesh(p);

      return { data: { sharing: true, port, peersDiscovered: peers.length, message: `Sharing on port ${port}` } };
    } catch (err) {
      return { data: { sharing: false, message: `Failed: ${errorMessage(err)}` } };
    }
  },
});
