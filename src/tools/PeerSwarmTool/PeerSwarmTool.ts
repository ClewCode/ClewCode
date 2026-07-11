import * as React from 'react';
import { z } from 'zod/v4';
import { MessageResponse } from '../../components/MessageResponse.js';
import { Text } from '../../ink.js';
import { dispatchSwarmCommand } from '../../peer/swarmDispatch.js';
import { buildTool } from '../../Tool.js';
import { getCwd } from '../../utils/cwd.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { truncateText } from '../peer/peerFeedback.js';
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
    const data = await dispatchSwarmCommand(input);
    return { data };
  },
});
