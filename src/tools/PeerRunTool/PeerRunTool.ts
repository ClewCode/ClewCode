import { exec } from 'node:child_process';
import { z } from 'zod/v4';
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
  }),
);

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean(),
    stdout: z.string().optional(),
    stderr: z.string().optional(),
    exitCode: z.number().optional(),
    error: z.string().optional(),
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
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    if (!output.success) return { tool_use_id: toolUseID, type: 'tool_result', content: `Peer command failed: ${output.error}` };
    const out = (output.stdout || '').trim() || output.stderr || '(empty)';
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: `${output.exitCode === 0 ? '✓' : '✗'} exit ${output.exitCode}: ${truncateText(out, 500)}`,
    };
  },
  async call(input: { worker: string; command: string; timeout?: number }) {
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
        body: JSON.stringify({ command: input.command }),
        signal: AbortSignal.timeout(timeout + 5000),
      });

      if (!response.ok) {
        const message = `Worker responded with HTTP ${response.status}`;
        notifyPeerFeedback(message, 'peer-run-error', 'high');
        return { data: { success: false, error: message } };
      }

      const result = await response.json();
      notifyPeerFeedback(
        `command ${result.exitCode === 0 ? 'succeeded' : 'failed'} with exit ${result.exitCode ?? 1}`,
        'peer-run-result',
        result.exitCode === 0 ? 'medium' : 'high',
      );
      return {
        data: {
          success: result.exitCode === 0,
          stdout: result.stdout ?? '',
          stderr: result.stderr ?? '',
          exitCode: result.exitCode ?? 1,
        },
      };
    } catch (err) {
      const error = errorMessage(err);
      notifyPeerFeedback(`failed: ${truncateText(error, 120)}`, 'peer-run-error', 'high');
      return { data: { success: false, error: `Failed: ${error}` } };
    }
  },
});
