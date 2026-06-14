import { z } from 'zod/v4';
import { getGlobalMeshStore } from '../../mesh/MeshStore.js';
import { buildTool } from '../../Tool.js';
import { getCwd } from '../../utils/cwd.js';
import { errorMessage } from '../../utils/errors.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { DESCRIPTION, MESH_BROADCAST_TOOL_NAME, PROMPT } from './prompt.js';

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

export const MeshBroadcastTool = buildTool({
  isConcurrencySafe() {
    return true;
  },
  isReadOnly() {
    return false;
  },
  name: MESH_BROADCAST_TOOL_NAME,
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
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    if (!output.success) return { tool_use_id: toolUseID, type: 'tool_result', content: `[Mesh] Broadcast failed` };
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
    const store = getGlobalMeshStore();
    const peers = store.getMeshs();

    if (peers.length === 0) {
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

    // First, check each mesh node's status (idle/busy/queue depth)
    const meshStatuses: Array<{
      peer: (typeof peers)[0];
      isBusy: boolean;
      queueDepth: number;
      reachable: boolean;
    }> = [];

    for (const peer of peers) {
      try {
        const infoUrl = `http://${peer.ip || '127.0.0.1'}:${peer.port}/mesh-info`;
        const infoRes = await fetch(infoUrl, { signal: AbortSignal.timeout(3000) });
        if (infoRes.ok) {
          const info = await infoRes.json();
          meshStatuses.push({
            peer,
            isBusy: info.isBusy === true,
            queueDepth: typeof info.queueDepth === 'number' ? info.queueDepth : 0,
            reachable: true,
          });
        } else {
          meshStatuses.push({ peer, isBusy: false, queueDepth: 0, reachable: false });
        }
      } catch {
        meshStatuses.push({ peer, isBusy: false, queueDepth: 0, reachable: false });
      }
    }

    // Sort: idle first, then by queue depth ascending
    meshStatuses.sort((a, b) => {
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

    for (const ps of meshStatuses) {
      if (!ps.reachable) {
        failed++;
        results.push({ hostname: ps.peer.hostname, success: false, error: 'Unreachable' });
        continue;
      }

      try {
        const url = `http://${ps.peer.ip || '127.0.0.1'}:${ps.peer.port}/mesh-todo`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: 'ai-agent', fromName: 'Clew AI', message: input.task }),
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
