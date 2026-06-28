import { z } from 'zod/v4';
import { getGlobalDiscovery } from '../../peer/PeerDiscovery.js';
import { getGlobalPeerStore } from '../../peer/PeerStore.js';
import { buildTool } from '../../Tool.js';
import { getCwd } from '../../utils/cwd.js';
import { errorMessage } from '../../utils/errors.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { notifyPeerFeedback, truncateText } from '../peer/peerFeedback.js';
import { DESCRIPTION, PEER_BROADCAST_TOOL_NAME, PROMPT } from './prompt.js';

const inputSchema = lazySchema(() =>
  z.object({
    task: z.string().describe('Task description to broadcast to all peers'),
  }),
);

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean(),
    totalMeshs: z.number(),
    delivered: z.number(),
    failed: z.number(),
    results: z.array(
      z.object({
        hostname: z.string(),
        success: z.boolean(),
        taskId: z.string().optional(),
        error: z.string().optional(),
        isBusy: z.boolean().optional(),
        queueDepth: z.number().optional(),
      }),
    ),
  }),
);

export type Output = z.infer<ReturnType<typeof outputSchema>>;

export const PeerBroadcastTool = buildTool({
  isConcurrencySafe() {
    return true;
  },
  isReadOnly() {
    return false;
  },
  name: PEER_BROADCAST_TOOL_NAME,
  searchHint: 'broadcast a task to all peers',
  maxResultSizeChars: 5_000,
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
    return `broadcast task to all peers: ${truncateText(input.task, 120)}`;
  },
  renderToolResultMessage(output) {
    if (output.totalMeshs === 0) return 'No connected peers to broadcast to.';
    const failed = output.failed > 0 ? `, ${output.failed} failed` : '';
    return `Broadcast delivered to ${output.delivered}/${output.totalMeshs} peer(s)${failed}.`;
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    if (!output.success) return { tool_use_id: toolUseID, type: 'tool_result', content: `[Peer] Broadcast failed` };
    const summary = output.results
      .map((r: any) => {
        const status = r.isBusy ? `(busy q=${r.queueDepth})` : '(idle)';
        return `${r.success ? '✓' : '✗'}${r.hostname}${status}`;
      })
      .join(' ');
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: `✓ broadcast ${output.delivered}/${output.totalMeshs}: ${summary}`,
    };
  },
  async call(input: { task: string }) {
    const store = getGlobalPeerStore();
    const peers = store.getMeshs();
    notifyPeerFeedback(`broadcasting task to ${peers.length} peer(s)`, 'peer-broadcast', 'low');

    if (peers.length === 0) {
      notifyPeerFeedback('broadcast skipped: no connected peers', 'peer-broadcast-result', 'low');
      return {
        data: {
          success: false,
          totalMeshs: 0,
          delivered: 0,
          failed: 0,
          results: [],
        },
      };
    }

    // First, check each peer node's status (idle/busy/queue depth)
    notifyPeerFeedback('checking peer availability', 'peer-broadcast-status', 'low');
    const peerStatuses: Array<{
      peer: (typeof peers)[0];
      isBusy: boolean;
      queueDepth: number;
      reachable: boolean;
    }> = [];

    for (const peer of peers) {
      try {
        const infoUrl = `http://${peer.ip || '127.0.0.1'}:${peer.port}/peer-info`;
        const infoRes = await fetch(infoUrl, { signal: AbortSignal.timeout(3000) });
        if (infoRes.ok) {
          const info = await infoRes.json();
          peerStatuses.push({
            peer,
            isBusy: info.isBusy === true,
            queueDepth: typeof info.queueDepth === 'number' ? info.queueDepth : 0,
            reachable: true,
          });
        } else {
          peerStatuses.push({ peer, isBusy: false, queueDepth: 0, reachable: false });
        }
      } catch {
        peerStatuses.push({ peer, isBusy: false, queueDepth: 0, reachable: false });
      }
    }

    // Sort: idle first, then by queue depth ascending
    peerStatuses.sort((a, b) => {
      if (a.reachable !== b.reachable) return a.reachable ? -1 : 1;
      if (a.isBusy !== b.isBusy) return a.isBusy ? 1 : -1;
      return a.queueDepth - b.queueDepth;
    });

    const results: Array<{
      hostname: string;
      success: boolean;
      taskId?: string;
      error?: string;
      isBusy?: boolean;
      queueDepth?: number;
    }> = [];
    let delivered = 0;
    let failed = 0;

    for (const ps of peerStatuses) {
      if (!ps.reachable) {
        failed++;
        results.push({ hostname: ps.peer.hostname, success: false, error: 'Unreachable' });
        continue;
      }

      try {
        notifyPeerFeedback(`sending task to ${ps.peer.hostname}:${ps.peer.port}`, 'peer-broadcast-send', 'low');
        const discovery = getGlobalDiscovery();
        const targetToken = store.getPeerToken(ps.peer.id) || discovery.getPeerToken(ps.peer.id) || '';
        const url = `http://${ps.peer.ip || '127.0.0.1'}:${ps.peer.port}/peer-todo`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: 'ai-agent', fromName: 'Clew AI', message: input.task, token: targetToken }),
          signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
          failed++;
          results.push({
            hostname: ps.peer.hostname,
            success: false,
            error: `HTTP ${response.status}`,
            isBusy: ps.isBusy,
            queueDepth: ps.queueDepth,
          });
          continue;
        }

        const result = await response.json();
        delivered++;
        results.push({
          hostname: ps.peer.hostname,
          success: true,
          taskId: result.id,
          isBusy: ps.isBusy,
          queueDepth: ps.queueDepth,
        });

        store.addTodo({
          id: result.id ?? `todo_${Date.now()}_${ps.peer.hostname}`,
          from: 'local',
          fromName: 'Me',
          message: `→ ${ps.peer.hostname}: ${input.task}`,
          createdAt: Date.now(),
          status: 'pending',
        });
      } catch (err) {
        failed++;
        results.push({
          hostname: ps.peer.hostname,
          success: false,
          error: errorMessage(err),
          isBusy: ps.isBusy,
          queueDepth: ps.queueDepth,
        });
      }
    }

    notifyPeerFeedback(
      `broadcast delivered to ${delivered}/${peers.length} peer(s)`,
      'peer-broadcast-result',
      delivered > 0 ? 'medium' : 'high',
    );
    return {
      data: {
        success: delivered > 0,
        totalMeshs: peers.length,
        delivered,
        failed,
        results,
      },
    };
  },
});
