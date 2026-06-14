import { z } from 'zod/v4';
import { getGlobalDiscovery } from '../../mesh/MeshDiscovery.js';
import { getGlobalMeshStore } from '../../mesh/MeshStore.js';
import { buildTool } from '../../Tool.js';
import { getCwd } from '../../utils/cwd.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { DESCRIPTION, MESH_SET_NAME_TOOL_NAME, PROMPT } from './prompt.js';

const inputSchema = lazySchema(() =>
  z.object({
    worker: z.string().describe('Hostname or peer ID of the worker'),
    name: z.string().describe('Custom display name for this worker'),
  }),
);

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean(),
    workerHostname: z.string().optional(),
    name: z.string().optional(),
    error: z.string().optional(),
  }),
);

export type Output = z.infer<ReturnType<typeof outputSchema>>;

export const MeshSetNameTool = buildTool({
  isConcurrencySafe() {
    return true;
  },
  isReadOnly() {
    return false;
  },
  name: MESH_SET_NAME_TOOL_NAME,
  searchHint: 'set peer display name',
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
    return { tool_use_id: toolUseID, type: 'tool_result', content: `✓ name: ${output.name}` };
  },
  async call(input: { worker: string; name: string }) {
    const store = getGlobalMeshStore();
    const discovery = getGlobalDiscovery();

    if (input.worker === 'me' || input.worker === 'self') {
      discovery.setLocalName(input.name);
      store.setMeshName(discovery.meshId, input.name);
      const { getGlobalMeshServer } = await import('../../mesh/MeshServer.js');
      const server = getGlobalMeshServer();
      server.extraInfo.displayName = input.name;
      return { data: { success: true, workerHostname: 'self', name: input.name } };
    }

    // Find peer by hostname/ID
    let peer = store.findMesh(input.worker);
    if (!peer) {
      const peers = await discovery.discoverMeshs(3000);
      for (const p of peers) store.addMesh(p);
      peer = store.findMesh(input.worker);
    }
    if (!peer) {
      return { data: { success: false, error: `Worker "${input.worker}" not found` } };
    }
    store.setMeshName(peer.id, input.name);
    return { data: { success: true, workerHostname: peer.hostname, name: input.name } };
  },
});
