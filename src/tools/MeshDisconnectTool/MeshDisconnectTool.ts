import { z } from 'zod/v4';
import { getGlobalMeshStore } from '../../mesh/MeshStore.js';
import type { ValidationResult } from '../../Tool.js';
import { buildTool } from '../../Tool.js';
import { getCwd } from '../../utils/cwd.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { DESCRIPTION, MESH_DISCONNECT_TOOL_NAME, PROMPT } from './prompt.js';

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

export const MeshDisconnectTool = buildTool({
  isConcurrencySafe() {
    return true;
  },
  isReadOnly() {
    return false;
  },
  name: MESH_DISCONNECT_TOOL_NAME,
  searchHint: 'disconnect a mesh node',
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
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    if (!output.success)
      return { tool_use_id: toolUseID, type: 'tool_result', content: `[Mesh] Failed: ${output.error}` };
    return { tool_use_id: toolUseID, type: 'tool_result', content: `✗ disconnected ${output.hostname}` };
  },
  async call(input: { peer: string }) {
    const store = getGlobalMeshStore();
    let peer = store.findMesh(input.peer);

    const portNum = parseInt(input.peer, 10);
    if (!peer && !isNaN(portNum)) peer = store.getMeshByPort(portNum);

    if (!peer) {
      return { data: { success: false, error: `Mesh "${input.peer}" not found` } };
    }

    store.removeMesh(peer.id);
    return { data: { success: true, hostname: peer.hostname } };
  },
});
