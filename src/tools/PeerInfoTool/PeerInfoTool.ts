import { z } from 'zod/v4';
import { getGlobalDiscovery } from '../../peer/PeerDiscovery.js';
import { getGlobalPeerStore } from '../../peer/PeerStore.js';
import { buildTool } from '../../Tool.js';
import { getCwd } from '../../utils/cwd.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { clampTimeout, formatPeerDetails, notifyPeerFeedback, retryUntil } from '../peer/peerFeedback.js';
import { DESCRIPTION, PEER_INFO_TOOL_NAME, PROMPT } from './prompt.js';

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

export const PeerInfoTool = buildTool({
  isConcurrencySafe() {
    return true;
  },
  isReadOnly() {
    return true;
  },
  name: PEER_INFO_TOOL_NAME,
  searchHint: 'get peer info',
  isTransparentWrapper() {
    return true;
  },
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
    return input.wait ? `wait for peer info: ${input.worker}` : `get peer info: ${input.worker}`;
  },
  renderToolResultMessage(output) {
    if (!output.found) return output.error ?? 'Peer not found.';
    return `Peer ${output.hostname}:${output.port ?? '?'}${output.role ? ` [${output.role}]` : ''}`;
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
      content: `${prefix} ${formatPeerDetails(output)}`,
    };
  },
  async call(input: { worker: string; wait?: boolean; timeout?: number }) {
    const store = getGlobalPeerStore();
    const timeoutMs = clampTimeout(input.timeout, 30, 120);
    notifyPeerFeedback(
      input.wait
        ? `waiting up to ${Math.round(timeoutMs / 1000)}s for ${input.worker}`
        : `getting info for ${input.worker}`,
      'peer-info',
      'low',
    );

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
              const url = `http://${host}:${port}/peer-info`;
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
          port: peer.port,
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

    const { result, waited, timedOut } = input.wait
      ? await retryUntil(
          attemptFind,
          r => r.found,
          timeoutMs,
          2000,
          async () => {
            try {
              const discovery = getGlobalDiscovery();
              const peers = await discovery.discoverPeers(3000);
              for (const p of peers) store.addPeer(p);
            } catch {
              /* best-effort */
            }
          },
        )
      : { result: await attemptFind(), waited: false, timedOut: false };

    if (!result.found) {
      notifyPeerFeedback(`peer info not found: ${input.worker}`, 'peer-info-result', 'high');
      return { data: { found: false, waited, timedOut, error: result.error } };
    }

    notifyPeerFeedback(
      `found ${result.data?.hostname ?? input.worker}:${result.data?.port ?? '?'}`,
      'peer-info-result',
      'medium',
    );
    return { data: { found: true, waited, timedOut: false, ...result.data } };
  },
});
