import * as React from 'react';
import { z } from 'zod/v4';
import { MessageResponse } from '../../components/MessageResponse.js';
import { Text } from '../../ink.js';
import { getGlobalPeerStore } from '../../peer/PeerStore.js';
import { buildTool } from '../../Tool.js';
import { getCwd } from '../../utils/cwd.js';
import { errorMessage } from '../../utils/errors.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { DESCRIPTION, PEER_SWARM_TOOL_NAME, PROMPT } from './prompt.js';

const inputSchema = lazySchema(() =>
  z.object({
    command: z.string().describe('Shell command to execute on all connected peers'),
    filter: z.string().optional().describe('Optional filter: only peers whose hostname or role includes this string'),
    timeout: z.number().optional().default(60).describe('Per-peer timeout in seconds (default: 60, max: 300)'),
  }),
);

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean(),
    totalPeers: z.number(),
    succeeded: z.number(),
    failed: z.number(),
    timedOut: z.number(),
    results: z.array(
      z.object({
        hostname: z.string(),
        success: z.boolean(),
        stdout: z.string().optional(),
        stderr: z.string().optional(),
        exitCode: z.number().optional(),
        error: z.string().optional(),
        durationMs: z.number().optional(),
      }),
    ),
  }),
);

export type Output = z.infer<ReturnType<typeof outputSchema>>;

export const PeerSwarmTool = buildTool({
  isConcurrencySafe() {
    return false;
  },
  isReadOnly() {
    return false;
  },
  name: PEER_SWARM_TOOL_NAME,
  searchHint: 'run a command on all peers simultaneously',
  maxResultSizeChars: 15_000,
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
  userFacingName() {
    return 'PeerSwarm';
  },
  renderToolUseMessage(input) {
    return `on ALL peers: $ ${input.command}`;
  },
  renderToolResultMessage(output) {
    if (output.totalPeers === 0) {
      return React.createElement(
        MessageResponse,
        null,
        React.createElement(Text, { dimColor: true }, 'No connected peers.'),
      );
    }
    const summary = `${output.succeeded}/${output.totalPeers} peers succeeded`;
    return React.createElement(
      MessageResponse,
      null,
      React.createElement(Text, { color: output.succeeded > 0 ? undefined : 'ansi:red' }, summary),
    );
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    if (output.totalPeers === 0) {
      return { tool_use_id: toolUseID, type: 'tool_result', content: '[Swarm] No connected peers.' };
    }
    const lines: string[] = [];
    for (const r of output.results) {
      const icon = r.success ? '✓' : '✗';
      const info = r.error ? ` (${r.error})` : r.exitCode !== undefined ? ` (exit ${r.exitCode})` : '';
      lines.push(`${icon} ${r.hostname}${info}`);
      if (r.stdout?.trim()) {
        const out = r.stdout.trim().slice(0, 300);
        lines.push(`  ${out}`);
      }
    }
    lines.push('---');
    lines.push(`${output.succeeded}/${output.totalPeers} peers succeeded`);
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: lines.join('\n'),
    };
  },
  async call(input: { command: string; filter?: string; timeout?: number }) {
    const store = getGlobalPeerStore();
    const allPeers = store.getConnections().filter(p => p.status === 'online' && p.port > 0);

    if (allPeers.length === 0) {
      return {
        data: {
          success: false,
          totalPeers: 0,
          succeeded: 0,
          failed: 0,
          timedOut: 0,
          results: [],
        },
      };
    }

    // Apply optional filter
    let peers = allPeers;
    if (input.filter) {
      const f = input.filter.toLowerCase();
      peers = allPeers.filter(p => {
        const tags = store.getPeerTags(p.id);
        const name = p.hostname.toLowerCase();
        const role = (tags?.role ?? '').toLowerCase();
        return name.includes(f) || role.includes(f);
      });
      if (peers.length === 0) {
        return {
          data: {
            success: false,
            totalPeers: allPeers.length,
            succeeded: 0,
            failed: 0,
            timedOut: 0,
            results: [],
            error: `No peers match filter "${input.filter}"`,
          },
        };
      }
    }

    const timeoutMs = Math.min(Math.max(1, input.timeout ?? 60), 300) * 1000;
    const results: Output['results'] = [];
    let succeeded = 0;
    let failed = 0;
    let timedOut = 0;

    const requests = peers.map(async peer => {
      const start = performance.now();
      try {
        const url = `http://${peer.ip || '127.0.0.1'}:${peer.port}/peer-exec`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            command: input.command,
            priority: 'normal',
            from: 'ai-agent',
            fromName: 'Clew AI',
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });

        const durationMs = Math.round(performance.now() - start);

        if (!response.ok && response.status !== 503) {
          failed++;
          results.push({
            hostname: peer.hostname,
            success: false,
            error: `HTTP ${response.status}`,
            durationMs,
          });
          return;
        }

        const body = await response.json();

        if (body.queued) {
          failed++;
          results.push({
            hostname: peer.hostname,
            success: false,
            error: `queued (position ${body.queuePosition})`,
            durationMs,
          });
          return;
        }

        if (body.result) {
          const ok = body.result.exitCode === 0;
          if (ok) succeeded++;
          else failed++;
          results.push({
            hostname: peer.hostname,
            success: ok,
            stdout: body.result.stdout ?? '',
            stderr: body.result.stderr ?? '',
            exitCode: body.result.exitCode,
            durationMs,
          });
          return;
        }

        failed++;
        results.push({
          hostname: peer.hostname,
          success: false,
          error: body.error || 'Unknown response',
          durationMs,
        });
      } catch (err: any) {
        const durationMs = Math.round(performance.now() - start);
        const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
        if (isTimeout) timedOut++;
        else failed++;
        results.push({
          hostname: peer.hostname,
          success: false,
          error: isTimeout ? `timed out after ${timeoutMs / 1000}s` : errorMessage(err),
          durationMs,
        });
      }
    });

    await Promise.allSettled(requests);

    return {
      data: {
        success: succeeded > 0,
        totalPeers: peers.length,
        succeeded,
        failed,
        timedOut,
        results,
      },
    };
  },
});
