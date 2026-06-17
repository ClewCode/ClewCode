import { exec } from 'node:child_process';
import * as React from 'react';
import { z } from 'zod/v4';
import { MessageResponse } from '../../components/MessageResponse.js';
import { Box, Text } from '../../ink.js';
import { getGlobalDiscovery } from '../../peer/PeerDiscovery.js';
import { getGlobalPeerStore } from '../../peer/PeerStore.js';
import { buildTool } from '../../Tool.js';
import { getCwd } from '../../utils/cwd.js';
import { errorMessage } from '../../utils/errors.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { notifyPeerFeedback, truncateText } from '../peer/peerFeedback.js';
import { DESCRIPTION, PEER_RUN_TOOL_NAME, PROMPT } from './prompt.js';

const inputSchema = lazySchema(() =>
  z.object({
    worker: z.string().describe('Hostname or peer ID of the target worker'),
    command: z.string().describe('Shell command to execute on the worker'),
    timeout: z.number().optional().default(30).describe('Max execution time in seconds (default: 30, max: 120)'),
    priority: z
      .enum(['low', 'normal', 'high'])
      .optional()
      .default('normal')
      .describe('Task priority (low/normal/high). High priority tasks skip the queue.'),
  }),
);

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean(),
    stdout: z.string().optional(),
    stderr: z.string().optional(),
    exitCode: z.number().optional(),
    error: z.string().optional(),
    queued: z.boolean().optional(),
    queuePosition: z.number().optional(),
    queueDepth: z.number().optional(),
  }),
);

export type Output = z.infer<ReturnType<typeof outputSchema>>;

/**
 * Execute a command on the local machine (for when we receive an exec request).
 */
export function executeCommand(
  command: string,
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise(resolve => {
    const child = exec(
      command,
      {
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024, // 1MB
        shell: process.env.SHELL || (process.platform === 'win32' ? process.env.ComSpec || 'cmd' : '/bin/sh'),
      },
      (err, stdout, stderr) => {
        resolve({
          stdout: stdout ?? '',
          stderr: stderr ?? '',
          exitCode: err?.code ?? 0,
        });
      },
    );
  });
}

export const PeerRunTool = buildTool({
  isConcurrencySafe() {
    return false;
  },
  isReadOnly() {
    return false;
  },
  name: PEER_RUN_TOOL_NAME,
  searchHint: 'run command on a worker',
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
  getPath() {
    return getCwd();
  },
  userFacingName() {
    return 'PeerRun';
  },
  renderToolUseMessage(input) {
    return `on ${input.worker}: $ ${input.command}`;
  },
  renderToolResultMessage(output) {
    if (!output.success) {
      return React.createElement(
        MessageResponse,
        null,
        React.createElement(Text, { color: 'ansi:red' }, `Failed: ${output.error || `exit ${output.exitCode}`}`),
      );
    }
    const out = (output.stdout || '').trim() || output.stderr || '(empty)';
    return React.createElement(
      MessageResponse,
      null,
      React.createElement(Text, { dimColor: true }, `exit ${output.exitCode}: ${truncateText(out, 120)}`),
    );
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    if (!output.success)
      return { tool_use_id: toolUseID, type: 'tool_result', content: `Peer command failed: ${output.error}` };
    const out = (output.stdout || '').trim() || output.stderr || '(empty)';
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: `${output.exitCode === 0 ? '✓' : '✗'} exit ${output.exitCode}: ${truncateText(out, 500)}`,
    };
  },
  async call(input: { worker: string; command: string; timeout?: number; priority?: 'low' | 'normal' | 'high' }) {
    const store = getGlobalPeerStore();
    let peer = store.findPeer(input.worker);

    const portNum = parseInt(input.worker, 10);
    if (!peer && !isNaN(portNum)) {
      peer = store.getPeerByPort(portNum);
    }

    if (!peer) {
      const discovery = getGlobalDiscovery();
      const peers = await discovery.discoverPeers(3000);
      for (const p of peers) store.addPeer(p);
      peer = store.findPeer(input.worker);
      if (!peer && !isNaN(portNum)) peer = store.getPeerByPort(portNum);
    }

    if (!peer) {
      const message = `Worker "${input.worker}" not found`;
      notifyPeerFeedback(message, 'peer-run-not-found', 'high');
      return { data: { success: false, error: message } };
    }

    try {
      const timeout = Math.min(Math.max(1, input.timeout ?? 30), 120) * 1000;
      notifyPeerFeedback(`running on ${peer.hostname}:${peer.port}`, 'peer-run', 'low');
      const url = `http://${peer.ip || '127.0.0.1'}:${peer.port}/peer-exec`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: input.command,
          priority: input.priority ?? 'normal',
          from: 'ai-agent',
          fromName: 'Clew AI',
        }),
        signal: AbortSignal.timeout(timeout + 5000),
      });

      if (!response.ok && response.status !== 503) {
        const message = `Worker responded with HTTP ${response.status}`;
        notifyPeerFeedback(message, 'peer-run-error', 'high');
        return { data: { success: false, error: message } };
      }

      const body = await response.json();

      // Task was queued (busy peer)
      if (body.queued) {
        notifyPeerFeedback(
          `queued at position ${body.queuePosition} (depth: ${body.queueDepth})`,
          'peer-run-queued',
          'medium',
        );
        return {
          data: {
            success: true,
            queued: true,
            queuePosition: body.queuePosition,
            queueDepth: body.queueDepth,
            stdout: `⏳ Task queued at position ${body.queuePosition} on ${peer.hostname} (${body.queueDepth} tasks in queue)`,
          },
        };
      }

      // Queue full
      if (body.error === 'Queue full') {
        const message = `Worker queue is full (${body.queueDepth} tasks waiting)`;
        notifyPeerFeedback(message, 'peer-run-error', 'high');
        return { data: { success: false, error: message } };
      }

      // Ran immediately
      notifyPeerFeedback(
        `command ${body.result?.exitCode === 0 ? 'succeeded' : 'failed'} with exit ${body.result?.exitCode ?? 1}`,
        'peer-run-result',
        body.result?.exitCode === 0 ? 'medium' : 'high',
      );
      return {
        data: {
          success: body.result?.exitCode === 0,
          stdout: body.result?.stdout ?? '',
          stderr: body.result?.stderr ?? '',
          exitCode: body.result?.exitCode ?? 1,
        },
      };
    } catch (err) {
      const error = errorMessage(err);
      notifyPeerFeedback(`failed: ${truncateText(error, 120)}`, 'peer-run-error', 'high');
      return { data: { success: false, error: `Failed: ${error}` } };
    }
  },
});
