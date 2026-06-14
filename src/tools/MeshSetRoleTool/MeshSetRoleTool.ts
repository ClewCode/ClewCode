import { z } from 'zod/v4';
import { getGlobalDiscovery } from '../../mesh/MeshDiscovery.js';
import { getGlobalMeshStore } from '../../mesh/MeshStore.js';
import { buildTool } from '../../Tool.js';
import { getCwd } from '../../utils/cwd.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { DESCRIPTION, MESH_SET_ROLE_TOOL_NAME, PROMPT } from './prompt.js';

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

export const MeshSetRoleTool = buildTool({
  isConcurrencySafe() {
    return true;
  },
  isReadOnly() {
    return false;
  },
  name: MESH_SET_ROLE_TOOL_NAME,
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
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    if (!output.success)
      return { tool_use_id: toolUseID, type: 'tool_result', content: `[Mesh] Failed: ${output.error}` };
    return { tool_use_id: toolUseID, type: 'tool_result', content: `✓ role: ${output.role}` };
  },
  async call(input: { worker: string; role: string }) {
    const store = getGlobalMeshStore();
    const discovery = getGlobalDiscovery();

    if (input.worker === 'me' || input.worker === 'self') {
      store.setMeshRole(discovery.meshId, input.role);
      const { getGlobalMeshServer } = await import('../../mesh/MeshServer.js');
      const server = getGlobalMeshServer();
      server.extraInfo.role = input.role;
      return { data: { success: true, workerHostname: 'self', role: input.role } };
    }

    let peer = store.findMesh(input.worker);
    if (!peer) {
      const peers = await discovery.discoverMeshs(3000);
      for (const p of peers) store.addMesh(p);
      peer = store.findMesh(input.worker);
    }
    if (!peer) {
      return { data: { success: false, error: `Worker "${input.worker}" not found` } };
    }
    store.setMeshRole(peer.id, input.role);
    return { data: { success: true, workerHostname: peer.hostname, role: input.role } };
  },
});
