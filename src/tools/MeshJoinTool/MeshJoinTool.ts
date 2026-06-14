import { z } from 'zod/v4';
import { getGlobalMeshStore } from '../../mesh/MeshStore.js';
import { buildTool } from '../../Tool.js';
import { getCwd } from '../../utils/cwd.js';
import { errorMessage } from '../../utils/errors.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { notifyMeshFeedback, truncateText } from '../mesh/meshFeedback.js';
import { DESCRIPTION, MESH_JOIN_TOOL_NAME, PROMPT } from './prompt.js';

const inputSchema = lazySchema(() =>
  z.object({
    host: z.string().optional().default('127.0.0.1').describe('Hostname or IP (default: 127.0.0.1)'),
    port: z.number().describe('Port number of the mesh node to join'),
  }),
);

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean(),
    meshHostname: z.string().optional(),
    meshPort: z.number().optional(),
    displayName: z.string().optional(),
    role: z.string().optional(),
    shell: z.string().optional(),
    cwd: z.string().optional(),
    error: z.string().optional(),
  }),
);

export type Output = z.infer<ReturnType<typeof outputSchema>>;

export const MeshJoinTool = buildTool({
  isConcurrencySafe() {
    return true;
  },
  isReadOnly() {
    return false;
  },
  name: MESH_JOIN_TOOL_NAME,
  searchHint: 'join a mesh node',
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
    if (!output.success)
      return { tool_use_id: toolUseID, type: 'tool_result', content: `Failed to join peer: ${output.error}` };
    const extra = [output.displayName, output.role, output.shell].filter(Boolean).join(' ');
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: `✓ joined ${output.meshHostname}:${output.meshPort}${extra ? ` (${extra})` : ''}`,
    };
  },
  async call(input: { host?: string; port: number }) {
    const host = input.host || '127.0.0.1';
    notifyMeshFeedback(`joining ${host}:${input.port}`, 'mesh-join', 'low');
    try {
      const url = `http://${host}:${input.port}/mesh-info`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const info = await res.json();
      const store = getGlobalMeshStore();
      store.addConnection({
        id: info.id ?? `${host}:${input.port}`,
        hostname: info.hostname ?? host,
        ip: info.ip ?? host,
        port: info.port ?? input.port,
        cwd: info.cwd ?? '',
        version: info.version ?? '',
        lastSeen: Date.now(),
        status: 'online',
        shell: info.shell,
        platform: info.platform,
        term: info.term,
      });
      // Copy display name and role if present
      if (info.displayName) store.setMeshName(info.id, info.displayName);
      if (info.role) store.setMeshRole(info.id, info.role);
      notifyMeshFeedback(`joined ${info.hostname ?? host}:${info.port ?? input.port}`, 'mesh-join-result', 'medium');
      return {
        data: {
          success: true,
          meshHostname: info.hostname ?? host,
          meshPort: info.port ?? input.port,
          displayName: info.displayName,
          role: info.role,
          shell: info.shell,
          cwd: info.cwd,
        },
      };
    } catch (err) {
      const error = errorMessage(err);
      notifyMeshFeedback(`join failed: ${truncateText(error, 120)}`, 'mesh-join-error', 'high');
      return { data: { success: false, error: `Failed: ${error}` } };
    }
  },
});
