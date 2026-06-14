import { z } from 'zod/v4';
import { getGlobalDiscovery } from '../../swarm/SwarmDiscovery.js';
import { getGlobalSwarmStore } from '../../swarm/SwarmStore.js';
import { buildTool } from '../../Tool.js';
import { getCwd } from '../../utils/cwd.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { formatSwarmDetails } from '../swarm/swarmFeedback.js';
import { DESCRIPTION, SWARM_INFO_TOOL_NAME, PROMPT } from './prompt.js';

const inputSchema = lazySchema(() =>
  z.object({
    worker: z.string().describe('Hostname or peer ID of the worker'),
    wait: z
      .boolean()
      .optional()
      .default(false)
      .describe('If true and worker is not found, keep retrying up to `timeout` seconds. Use instead of polling.'),
    timeout: z
      .number()
      .optional()
      .default(30)
      .describe('Max seconds to wait when `wait` is true (default: 30, max: 120).'),
  }),
);

const outputSchema = lazySchema(() =>
  z.object({
    found: z.boolean(),
    id: z.string().optional(),
    hostname: z.string().optional(),
    displayName: z.string().optional(),
    role: z.string().optional(),
    ip: z.string().optional(),
    port: z.number().optional(),
    cwd: z.string().optional(),
    shell: z.string().optional(),
    platform: z.string().optional(),
    term: z.string().optional(),
    status: z.string().optional(),
    latencyMs: z.number().optional(),
    isBusy: z.boolean().optional(),
    queueDepth: z.number().optional(),
    lastSeen: z.number().optional(),
    waited: z.boolean().optional().describe('Whether the tool waited for the worker'),
    timedOut: z.boolean().optional().describe('Whether the wait timed out'),
    error: z.string().optional(),
  }),
);

export type Output = z.infer<ReturnType<typeof outputSchema>>;

export const SwarmInfoTool = buildTool({
  isConcurrencySafe() {
    return true;
  },
  isReadOnly() {
    return true;
  },
  name: SWARM_INFO_TOOL_NAME,
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
    if (!output.found) {
      let content = `Not found: ${output.error}`;
      if (output.waited && output.timedOut) content = `Still not found after waiting: ${output.error}`;
      return { tool_use_id: toolUseID, type: 'tool_result', content };
    }
    let prefix = '✓';
    if (output.waited) prefix = '⬆';
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: `${prefix} ${formatSwarmDetails(output)}`,
    };
  },
  async call(input: { worker: string; wait?: boolean; timeout?: number }) {
    const store = getGlobalSwarmStore();
    const timeoutMs = Math.min(Math.max(1, input.timeout ?? 30), 120) * 1000;

    // Try to find peer with optional retry
    const attemptFind = async (): Promise<{ found: boolean; data?: any; error?: string }> => {
      const peer = store.findPeer(input.worker);

      // If not found locally, try direct HTTP
      if (!peer) {
        const parts = input.worker.split(':');
        if (parts.length === 2) {
          const host = parts[0]!;
          const port = parseInt(parts[1]!, 10);
          if (!Number.isNaN(port)) {
            try {
              const url = `http://${host}:${port}/swarm-info`;
              const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
              if (res.ok) {
                const data = await res.json();
                return { found: true, data };
              }
            } catch {
              /* best-effort */
            }
          }
        }
        return { found: false, error: `Worker "${input.worker}" not found` };
      }

      return {
        found: true,
        data: {
          id: peer.id,
          hostname: peer.hostname,
          displayName: store.getPeerTags(peer.id)?.displayName,
          role: store.getPeerTags(peer.id)?.role,
          ip: peer.ip,
          port: swarm.port,
          cwd: peer.cwd,
          shell: peer.shell,
          platform: peer.platform,
          term: peer.term,
          status: peer.status,
          latencyMs: peer.latencyMs,
          isBusy: peer.isBusy,
          queueDepth: peer.queueDepth,
          lastSeen: peer.lastSeen,
        },
      };
    };

    let result = await attemptFind();
    let waited = false;
    let timedOut = false;

    // If `wait` is true and not found, retry every 2s
    if (input.wait && !result.found) {
      waited = true;
      const deadline = Date.now() + timeoutMs;
      const retryInterval = 2000;

      while (Date.now() < deadline) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) break;
        await new Promise(resolve => setTimeout(resolve, Math.min(retryInterval, remaining)));

        // Rediscover peers before retry
        try {
          const discovery = getGlobalDiscovery();
          const peers = await discovery.discoverPeers(3000);
          for (const p of peers) store.addPeer(p);
        } catch {
          /* best-effort */
        }

        result = await attemptFind();
        if (result.found) break;
      }

      if (!result.found) timedOut = true;
    }

    if (!result.found) {
      return { data: { found: false, waited, timedOut, error: result.error } };
    }

    return { data: { found: true, waited, timedOut: false, ...result.data } };
  },
});
