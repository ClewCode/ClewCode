import { z } from 'zod/v4';
import { buildTool } from '../../Tool.js';
import { getGlobalPeerStore } from '../../peer/PeerStore.js';
import { getCwd } from '../../utils/cwd.js';
import { errorMessage } from '../../utils/errors.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { DESCRIPTION, PEER_BROADCAST_TOOL_NAME, PROMPT } from './prompt.js';

const inputSchema = lazySchema(() =>
  z.object({
    task: z.string().describe('Task description to broadcast to all peers'),
  }),
);

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean(),
    totalPeers: z.number(),
    delivered: z.number(),
    failed: z.number(),
    results: z.array(z.object({
      hostname: z.string(),
      success: z.boolean(),
      taskId: z.string().optional(),
      error: z.string().optional(),
    })),
  }),
);

export type Output = z.infer<ReturnType<typeof outputSchema>>;

export const PeerBroadcastTool = buildTool({
  isConcurrencySafe() { return true; },
  isReadOnly() { return false; },
  name: PEER_BROADCAST_TOOL_NAME,
  searchHint: 'broadcast a task to all peers',
  maxResultSizeChars: 5_000,
  async description() { return DESCRIPTION; },
  async prompt() { return PROMPT; },
  get inputSchema() { return inputSchema(); },
  get outputSchema() { return outputSchema(); },
  getPath() { return getCwd(); },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    if (!output.success) return { tool_use_id: toolUseID, type: 'tool_result', content: `[Peer] Broadcast failed` };
    const summary = output.results.map((r: any) => `${r.success ? '✓' : '✗'}${r.hostname}`).join(' ');
    return { tool_use_id: toolUseID, type: 'tool_result', content: `✓ broadcast ${output.delivered}/${output.totalPeers}: ${summary}` };
  },
  async call(input: { task: string }) {
    const store = getGlobalPeerStore();
    const peers = store.getPeers();

    if (peers.length === 0) {
      return {
        data: {
          success: false,
          totalPeers: 0,
          delivered: 0,
          failed: 0,
          results: [],
        },
      };
    }

    const results: Array<{ hostname: string; success: boolean; taskId?: string; error?: string }> = [];
    let delivered = 0;
    let failed = 0;

    for (const peer of peers) {
      try {
        const url = `http://${peer.ip}:${peer.port}/peer-todo`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: 'ai-agent', fromName: 'Clew AI', message: input.task }),
          signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
          failed++;
          results.push({ hostname: peer.hostname, success: false, error: `HTTP ${response.status}` });
          continue;
        }

        const result = await response.json();
        delivered++;
        results.push({ hostname: peer.hostname, success: true, taskId: result.id });

        store.addTodo({
          id: result.id ?? `todo_${Date.now()}_${peer.hostname}`,
          from: 'local',
          fromName: 'Me',
          message: `→ ${peer.hostname}: ${input.task}`,
          createdAt: Date.now(),
          status: 'pending',
        });
      } catch (err) {
        failed++;
        results.push({ hostname: peer.hostname, success: false, error: errorMessage(err) });
      }
    }

    return {
      data: {
        success: delivered > 0,
        totalPeers: peers.length,
        delivered,
        failed,
        results,
      },
    };
  },
});
