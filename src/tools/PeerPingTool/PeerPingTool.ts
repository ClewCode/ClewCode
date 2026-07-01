import { z } from 'zod/v4';
import { getGlobalDiscovery } from '../../peer/PeerDiscovery.js';
import { getGlobalPeerStore } from '../../peer/PeerStore.js';
import type { ValidationResult } from '../../Tool.js';
import { buildTool } from '../../Tool.js';
import { getCwd } from '../../utils/cwd.js';
import { errorMessage } from '../../utils/errors.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { clampTimeout, notifyPeerFeedback, retryUntil, truncateText } from '../peer/peerFeedback.js';
import { DESCRIPTION, PEER_PING_TOOL_NAME, PROMPT } from './prompt.js';

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
    waited: z.boolean().optional().describe('Whether the tool retried waiting for the peer node'),
    timedOut: z.boolean().optional().describe('Whether the wait timed out'),
    error: z.string().optional(),
  }),
);

export type Output = z.infer<ReturnType<typeof outputSchema>>;

export const PeerPingTool = buildTool({
  isConcurrencySafe() {
    return true;
  },
  isReadOnly() {
    return true;
  },
  name: PEER_PING_TOOL_NAME,
  searchHint: 'ping a peer node to check if online',
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
  async validateInput(input: any): Promise<ValidationResult> {
    if (!input.peer || typeof input.peer !== 'string' || input.peer.length < 1) {
      return { result: false, message: 'peer must be a non-empty hostname or peer ID', errorCode: 1 };
    }
    return { result: true };
  },
  renderToolUseMessage(input) {
    return input.wait ? `wait for peer ${input.peer}` : `ping peer ${input.peer}`;
  },
  renderToolResultMessage(output) {
    if (!output.online) return output.error ?? 'Peer is offline or unreachable.';
    return `Peer online: ${output.hostname}:${output.port ?? '?'}${output.role ? ` [${output.role}]` : ''}`;
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
    const store = getGlobalPeerStore();
    const timeoutMs = clampTimeout(input.timeout, 30, 120);

    notifyPeerFeedback(
      input.wait ? `waiting up to ${Math.round(timeoutMs / 1000)}s for ${input.peer}` : `pinging ${input.peer}`,
      'peer-ping',
      'low',
    );

    // Try to find and ping peer, optionally with retry
    const attemptPing = async (): Promise<{ ok: boolean; result?: any; error?: string }> => {
      let peer = store.findPeer(input.peer);
      const portNum = parseInt(input.peer, 10);
      if (!peer && !Number.isNaN(portNum)) peer = store.getPeerByPort(portNum);

      if (!peer) {
        const discovery = getGlobalDiscovery();
        const peers = await discovery.discoverPeers(3000);
        for (const p of peers) store.addPeer(p);
        peer = store.findPeer(input.peer);
        if (!peer && !Number.isNaN(portNum)) peer = store.getPeerByPort(portNum);
      }

      if (!peer) {
        return { ok: false, error: `Peer "${input.peer}" not found` };
      }

      try {
        const url = `http://${peer.ip || '127.0.0.1'}:${peer.port}/peer-info`;
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

    // First attempt with optional retry
    const {
      result: attempt,
      waited,
      timedOut,
    } = input.wait
      ? await retryUntil(attemptPing, r => r.ok, timeoutMs)
      : { result: await attemptPing(), waited: false, timedOut: false };

    if (!attempt.ok) {
      notifyPeerFeedback(`offline: ${truncateText(attempt.error, 120)}`, 'peer-ping-result', 'high');
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
    notifyPeerFeedback(`online: ${info.hostname ?? input.peer}:${info.port ?? ''}`, 'peer-ping-result', 'medium');
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
