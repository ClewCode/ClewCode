import { z } from 'zod/v4';
import { getGlobalDiscovery } from '../../swarm/SwarmDiscovery.js';
import { getGlobalSwarmStore } from '../../swarm/SwarmStore.js';
import type { ValidationResult } from '../../Tool.js';
import { buildTool } from '../../Tool.js';
import { getCwd } from '../../utils/cwd.js';
import { errorMessage } from '../../utils/errors.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { notifySwarmFeedback, truncateText } from '../swarm/swarmFeedback.js';
import { DESCRIPTION, SWARM_PING_TOOL_NAME, PROMPT } from './prompt.js';

const inputSchema = lazySchema(() =>
  z.object({
    peer: z.string().describe('Hostname, peer ID, or port number to ping'),
    wait: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        'If true and peer is not found/offline, keep retrying up to `timeout` seconds. Use instead of polling in a loop.',
      ),
    timeout: z
      .number()
      .optional()
      .default(30)
      .describe('Max seconds to wait when `wait` is true (default: 30, max: 120).'),
  }),
);

const outputSchema = lazySchema(() =>
  z.object({
    online: z.boolean(),
    hostname: z.string().optional(),
    port: z.number().optional(),
    cwd: z.string().optional(),
    displayName: z.string().optional(),
    role: z.string().optional(),
    waited: z.boolean().optional().describe('Whether the tool retried waiting for the peer'),
    timedOut: z.boolean().optional().describe('Whether the wait timed out'),
    error: z.string().optional(),
  }),
);

export type Output = z.infer<ReturnType<typeof outputSchema>>;

export const SwarmPingTool = buildTool({
  isConcurrencySafe() {
    return true;
  },
  isReadOnly() {
    return true;
  },
  name: SWARM_PING_TOOL_NAME,
  searchHint: 'ping a peer to check if online',
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
  async validateInput(input: any): Promise<ValidationResult> {
    if (!input.peer || typeof input.peer !== 'string' || input.peer.length < 1) {
      return { result: false, message: 'peer must be a non-empty hostname or peer ID', errorCode: 1 };
    }
    return { result: true };
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    if (!output.online) {
      let content = `Peer is offline or unreachable: ${output.error}`;
      if (output.waited && output.timedOut) content = `Still offline after waiting: ${output.error}`;
      else if (output.waited) content = 'Peer not found yet; still waiting for discovery.';
      return { tool_use_id: toolUseID, type: 'tool_result', content };
    }
    let prefix = '✓';
    if (output.waited) prefix = '⬆';
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content:
        `${prefix} ${output.hostname}:${output.port} ${output.displayName || ''} ${output.role ? `[${output.role}]` : ''}`.trim(),
    };
  },
  async call(input: { peer: string; wait?: boolean; timeout?: number }) {
    const store = getGlobalSwarmStore();
    const timeoutMs = Math.min(Math.max(1, input.timeout ?? 30), 120) * 1000;

    notifySwarmFeedback(
      input.wait ? `waiting up to ${Math.round(timeoutMs / 1000)}s for ${input.peer}` : `pinging ${input.peer}`,
      'peer-ping',
      'low',
    );

    // Try to find and ping peer, optionally with retry
    const attemptPing = async (): Promise<{ ok: boolean; result?: any; error?: string }> => {
      let peer = store.findPeer(input.peer);
      const portNum = parseInt(input.peer, 10);
      if (!peer && !isNaN(portNum)) peer = store.getPeerByPort(portNum);

      if (!peer) {
        const discovery = getGlobalDiscovery();
        const peers = await discovery.discoverPeers(3000);
        for (const p of peers) store.addPeer(p);
        peer = store.findPeer(input.peer);
        if (!peer && !isNaN(portNum)) peer = store.getPeerByPort(portNum);
      }

      if (!peer) {
        return { ok: false, error: `Peer "${input.peer}" not found` };
      }

      try {
        const url = `http://${peer.ip || '127.0.0.1'}:${swarm.port}/swarm-info`;
        const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!response.ok) {
          return { ok: false, error: `HTTP ${response.status}` };
        }
        const info = await response.json();
        return { ok: true, result: info };
      } catch (err) {
        return { ok: false, error: errorMessage(err) };
      }
    };

    // First attempt
    let attempt = await attemptPing();
    let waited = false;
    let timedOut = false;

    // If `wait` is true and peer is not found/online, retry
    if (input.wait && !attempt.ok) {
      waited = true;
      const deadline = Date.now() + timeoutMs;
      const retryInterval = 2000; // 2 seconds between retries

      while (Date.now() < deadline) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) break;
        await new Promise(resolve => setTimeout(resolve, Math.min(retryInterval, remaining)));
        attempt = await attemptPing();
        if (attempt.ok) break;
      }

      if (!attempt.ok) {
        timedOut = true;
      }
    }

    if (!attempt.ok) {
      notifySwarmFeedback(`offline: ${truncateText(attempt.error, 120)}`, 'peer-ping-result', 'high');
      return {
        data: {
          online: false,
          waited,
          timedOut,
          error: attempt.error,
        },
      };
    }

    const info = attempt.result!;
    notifySwarmFeedback(`online: ${info.hostname ?? input.peer}:${info.port ?? ''}`, 'peer-ping-result', 'medium');
    return {
      data: {
        online: true,
        hostname: info.hostname,
        port: info.port,
        cwd: info.cwd,
        displayName: info.displayName,
        role: info.role,
        waited,
        timedOut: false,
      },
    };
  },
});
