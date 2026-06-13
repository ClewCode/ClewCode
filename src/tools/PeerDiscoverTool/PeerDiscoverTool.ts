import * as React from 'react';
import { z } from 'zod/v4';
import { MessageResponse } from '../../components/MessageResponse.js';
import { Box, Text } from '../../ink.js';
import { getGlobalDiscovery } from '../../peer/PeerDiscovery.js';
import { getGlobalPeerStore } from '../../peer/PeerStore.js';
import { buildTool } from '../../Tool.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { formatPeerList, notifyPeerFeedback } from '../peer/peerFeedback.js';
import { DESCRIPTION, PEER_DISCOVER_TOOL_NAME, PROMPT } from './prompt.js';

const inputSchema = lazySchema(() =>
  z.object({
    timeout: z
      .number()
      .optional()
      .default(3)
      .describe(
        'Per-round scan time in seconds (default: 3, max: 10). When `wait: true`, each re-scan uses this duration.',
      ),
    wait: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        'If true, keep discovering every few seconds until `minPeers` peers are found. Use instead of looping.',
      ),
    waitTimeout: z
      .number()
      .optional()
      .default(30)
      .describe('Total max seconds to wait when `wait` is true (default: 30, max: 120).'),
    minPeers: z
      .number()
      .optional()
      .default(1)
      .describe('Minimum number of peers to wait for when `wait` is true (default: 1).'),
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
    waited: z.boolean().optional().describe('Whether the tool waited for peers'),
    timedOut: z.boolean().optional().describe('Whether the wait timed out without enough peers'),
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
  userFacingName() {
    return 'PeerDiscover';
  },
  renderToolUseMessage(input) {
    const timeoutStr = input.timeout !== undefined ? `timeout: ${input.timeout}s` : 'default timeout';
    const waitStr = input.wait ? `, wait: true (minPeers: ${input.minPeers ?? 1})` : '';
    return `${timeoutStr}${waitStr}`;
  },
  renderToolResultMessage(output) {
    if (!output.success && output.count === 0) {
      return React.createElement(
        MessageResponse,
        null,
        React.createElement(Text, { dimColor: true, italic: true }, 'No peers found on LAN.'),
      );
    }
    return React.createElement(
      MessageResponse,
      null,
      React.createElement(
        Text,
        { dimColor: true },
        `Discovered ${output.count} peer(s): ${formatPeerList(output.workers)}`,
      ),
    );
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    if (!output.workers || output.workers.length === 0) {
      let content = 'No peers found on the local network.';
      if (output.waited && output.timedOut) content = 'Waited for peers but none appeared before timeout.';
      else if (output.waited) content = 'No peers yet; still waiting for discovery.';
      return { tool_use_id: toolUseID, type: 'tool_result', content };
    }
    let prefix = `✓ discovered ${output.workers.length} peer(s)`;
    if (output.waited && !output.timedOut) prefix = `✓ discovered ${output.workers.length} peer(s) after waiting`;
    else if (output.waited) prefix = `⌛ discovered ${output.workers.length} peer(s) before timeout`;
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: `${prefix}: ${formatPeerList(output.workers)}`,
    };
  },
  async call(input: { timeout?: number; wait?: boolean; waitTimeout?: number; minPeers?: number }) {
    const discovery = getGlobalDiscovery();
    const store = getGlobalPeerStore();
    const scanTimeout = Math.min(Math.max(1, input.timeout ?? 3), 10) * 1000;
    const minPeers = input.minPeers ?? 1;
    const waitTimeoutMs = Math.min(Math.max(1, input.waitTimeout ?? 30), 120) * 1000;

    notifyPeerFeedback(
      input.wait ? `discovering peers for up to ${Math.round(waitTimeoutMs / 1000)}s` : 'discovering peers',
      'peer-discover',
      'low',
    );

    // Helper to do one discover round
    const doDiscover = async (): Promise<number> => {
      const peers = await discovery.discoverPeers(scanTimeout);
      for (const p of peers) store.addPeer(p);
      return store.getPeers().length;
    };

    let count = await doDiscover();
    let waited = false;
    let timedOut = false;

    // If `wait` is true and not enough peers, keep trying
    if (input.wait && count < minPeers) {
      waited = true;
      const deadline = Date.now() + waitTimeoutMs;
      const retryInterval = 2000;

      while (Date.now() < deadline && count < minPeers) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) break;
        await new Promise(resolve => setTimeout(resolve, Math.min(retryInterval, remaining)));
        count = await doDiscover();
      }

      if (count < minPeers) timedOut = true;
    }

    const peers = store.getPeers();
    notifyPeerFeedback(
      peers.length > 0 ? `found ${peers.length} peer(s)` : 'no peers found',
      'peer-discover-result',
      peers.length > 0 ? 'medium' : 'low',
    );
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
        waited,
        timedOut,
      },
    };
  },
});
