import { z } from 'zod/v4';
import { buildTool } from '../../Tool.js';
import { getGlobalDiscovery } from '../../peer/PeerDiscovery.js';
import { getGlobalPeerStore } from '../../peer/PeerStore.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { DESCRIPTION, PEER_DISCOVER_TOOL_NAME, PROMPT } from './prompt.js';

const inputSchema = lazySchema(() =>
  z.object({
    timeout: z
      .number()
      .optional()
      .default(3)
      .describe('Time in seconds to wait for responses (default: 3, max: 10)'),
  }),
);

const outputSchema = lazySchema(() =>
  z.object({
    workers: z
      .array(
        z.object({
          id: z.string().describe('Unique worker ID'),
          hostname: z.string().describe('Machine hostname'),
          ip: z.string().describe('LAN IP address'),
          port: z.number().describe('Peer server port'),
          cwd: z.string().describe('Current working directory'),
          shell: z.string().optional().describe('Shell type'),
          platform: z.string().optional().describe('Platform'),
          lastSeen: z.number().describe('Last seen timestamp (epoch ms)'),
        }),
      )
      .describe('List of discovered workers'),
    count: z.number().describe('Number of workers found'),
  }),
);

export type Output = z.infer<ReturnType<typeof outputSchema>>;

export const PeerDiscoverTool = buildTool({
  isConcurrencySafe() {
    return true;
  },
  isReadOnly() {
    return true;
  },
  name: PEER_DISCOVER_TOOL_NAME,
  searchHint: 'discover workers on LAN',
  maxResultSizeChars: 10_000,
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
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    if (!output.workers || output.workers.length === 0) return { tool_use_id: toolUseID, type: 'tool_result', content: 'No peers found.' };
    return { tool_use_id: toolUseID, type: 'tool_result', content: output.workers.map((w: any) => `/peer join ${w.ip}:${w.port}  (${w.hostname})`).join('\n') };
  },
  async call(input: { timeout?: number }) {
    const discovery = getGlobalDiscovery();
    const store = getGlobalPeerStore();
    const timeout = Math.min(Math.max(1, input.timeout ?? 3), 10) * 1000;

    const peers = await discovery.discoverPeers(timeout);
    for (const p of peers) store.addPeer(p);

    return {
      data: {
        workers: peers.map(p => ({
          id: p.id,
          hostname: p.hostname,
          ip: p.ip,
          port: p.port,
          cwd: p.cwd,
          shell: p.shell,
          platform: p.platform,
          lastSeen: p.lastSeen,
        })),
        count: peers.length,
      },
    };
  },
});
