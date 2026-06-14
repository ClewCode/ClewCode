import * as React from 'react';
import { z } from 'zod/v4';
import { MessageResponse } from '../../components/MessageResponse.js';
import { Text } from '../../ink.js';
import { getGlobalDiscovery } from '../../mesh/MeshDiscovery.js';
import { getGlobalMeshStore } from '../../mesh/MeshStore.js';
import { buildTool } from '../../Tool.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { formatMeshDetails, notifyMeshFeedback } from '../mesh/meshFeedback.js';
import { DESCRIPTION, MESH_DISCOVER_TOOL_NAME, PROMPT } from './prompt.js';

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
        'If true, keep discovering every few seconds until `minMeshs` peers are found. Use instead of looping.',
      ),
    waitTimeout: z
      .number()
      .optional()
      .default(30)
      .describe('Total max seconds to wait when `wait` is true (default: 30, max: 120).'),
    minMeshs: z
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
          port: z.number().describe('Mesh server port'),
          cwd: z.string().describe('Current working directory'),
          shell: z.string().optional().describe('Shell type'),
          platform: z.string().optional().describe('Platform'),
          term: z.string().optional().describe('Terminal type'),
          status: z.string().optional().describe('Mesh status'),
          displayName: z.string().optional().describe('Display name'),
          role: z.string().optional().describe('Assigned role'),
          latencyMs: z.number().optional().describe('Last measured latency'),
          isBusy: z.boolean().optional().describe('Whether the mesh node is currently busy'),
          queueDepth: z.number().optional().describe('Queued peer tasks'),
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

export const MeshDiscoverTool = buildTool({
  isConcurrencySafe() {
    return true;
  },
  isReadOnly() {
    return true;
  },
  name: MESH_DISCOVER_TOOL_NAME,
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
    return 'MeshDiscover';
  },
  renderToolUseMessage(input) {
    const timeoutStr = input.timeout !== undefined ? `timeout: ${input.timeout}s` : 'default timeout';
    const waitStr = input.wait ? `, wait: true (minMeshs: ${input.minMeshs ?? 1})` : '';
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
        `Discovered ${output.count} peer(s): ${output.workers.map(formatMeshDetails).join(' | ')}`,
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
      content: `${prefix}:\n${output.workers.map(formatMeshDetails).join('\n')}`,
    };
  },
  async call(input: { timeout?: number; wait?: boolean; waitTimeout?: number; minMeshs?: number }) {
    const discovery = getGlobalDiscovery();
    const store = getGlobalMeshStore();
    const scanTimeout = Math.min(Math.max(1, input.timeout ?? 3), 10) * 1000;
    const minMeshs = input.minMeshs ?? 1;
    const waitTimeoutMs = Math.min(Math.max(1, input.waitTimeout ?? 30), 120) * 1000;

    notifyMeshFeedback(
      input.wait ? `discovering peers for up to ${Math.round(waitTimeoutMs / 1000)}s` : 'discovering peers',
      'mesh-discover',
      'low',
    );

    // Helper to do one discover round
    const doDiscover = async (): Promise<number> => {
      const peers = await discovery.discoverMeshs(scanTimeout);
      for (const p of peers) store.addMesh(p);
      return store.getMeshs().length;
    };

    let count = await doDiscover();
    let waited = false;
    let timedOut = false;

    // If `wait` is true and not enough peers, keep trying
    if (input.wait && count < minMeshs) {
      waited = true;
      const deadline = Date.now() + waitTimeoutMs;
      const retryInterval = 2000;

      while (Date.now() < deadline && count < minMeshs) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) break;
        await new Promise(resolve => setTimeout(resolve, Math.min(retryInterval, remaining)));
        count = await doDiscover();
      }

      if (count < minMeshs) timedOut = true;
    }

    const peers = store.getMeshs();
    const tagMap = new Map(store.getAllMeshTags().map(t => [t.meshId, t.tags]));
    notifyMeshFeedback(
      peers.length > 0 ? `found ${peers.length} peer(s)` : 'no peers found',
      'mesh-discover-result',
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
          term: p.term,
          status: p.status,
          displayName: tagMap.get(p.id)?.displayName,
          role: tagMap.get(p.id)?.role,
          latencyMs: p.latencyMs,
          isBusy: p.isBusy,
          queueDepth: p.queueDepth,
          lastSeen: p.lastSeen,
        })),
        count: peers.length,
        waited,
        timedOut,
      },
    };
  },
});
