import { z } from 'zod/v4';
import { buildTool } from '../../Tool.js';
import { getGlobalPeerStore } from '../../peer/PeerStore.js';
import { getCwd } from '../../utils/cwd.js';
import { errorMessage } from '../../utils/errors.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { DESCRIPTION, PEER_INFO_TOOL_NAME, PROMPT } from './prompt.js';

const inputSchema = lazySchema(() =>
  z.object({
    worker: z.string().describe('Hostname or peer ID of the worker'),
  }),
);

const outputSchema = lazySchema(() =>
  z.object({
    found: z.boolean(),
    id: z.string().optional(),
    hostname: z.string().optional(),
    ip: z.string().optional(),
    port: z.number().optional(),
    cwd: z.string().optional(),
    shell: z.string().optional(),
    platform: z.string().optional(),
    term: z.string().optional(),
    status: z.string().optional(),
    lastSeen: z.number().optional(),
    error: z.string().optional(),
  }),
);

export type Output = z.infer<ReturnType<typeof outputSchema>>;

export const PeerInfoTool = buildTool({
  isConcurrencySafe() {
    return true;
  },
  isReadOnly() {
    return true;
  },
  name: PEER_INFO_TOOL_NAME,
  searchHint: 'get peer info',
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
    if (!output.found) return { tool_use_id: toolUseID, type: 'tool_result', content: `Not found: ${output.error}` };
    return { tool_use_id: toolUseID, type: 'tool_result', content: `${output.hostname} | ${output.ip}:${output.port} | ${output.shell || '?'} | ${output.cwd || ''}` };
  },
  async call(input: { worker: string }) {
    const store = getGlobalPeerStore();
    const peer = store.findPeer(input.worker);

    // If not found locally, try direct HTTP
    if (!peer) {
      // Check if input looks like hostname:port or ip:port
      const parts = input.worker.split(':');
      if (parts.length === 2) {
        const host = parts[0]!;
        const port = parseInt(parts[1]!, 10);
        if (!isNaN(port)) {
          try {
            const url = `http://${host}:${port}/peer-info`;
            const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
            if (res.ok) {
              const data = await res.json();
              return { data: { found: true, ...data } };
            }
          } catch { /* best-effort */ }
        }
      }
      return { data: { found: false, error: `Worker "${input.worker}" not found` } };
    }

    return {
      data: {
        found: true,
        id: peer.id,
        hostname: peer.hostname,
        ip: peer.ip,
        port: peer.port,
        cwd: peer.cwd,
        shell: peer.shell,
        platform: peer.platform,
        term: peer.term,
        status: peer.status,
        lastSeen: peer.lastSeen,
      },
    };
  },
});
