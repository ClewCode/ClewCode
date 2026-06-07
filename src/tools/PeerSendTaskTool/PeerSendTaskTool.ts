import { z } from 'zod/v4';
import { buildTool } from '../../Tool.js';
import type { ValidationResult } from '../../Tool.js';
import { getGlobalPeerStore } from '../../peer/PeerStore.js';
import { getGlobalDiscovery } from '../../peer/PeerDiscovery.js';
import { getCwd } from '../../utils/cwd.js';
import { errorMessage } from '../../utils/errors.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { DESCRIPTION, PEER_SEND_TASK_TOOL_NAME, PROMPT } from './prompt.js';

const inputSchema = lazySchema(() =>
  z.object({
    worker: z.string().describe('Hostname, peer ID, or port number of the worker'),
    task: z.string().describe('Task description'),
  }),
);

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean(),
    taskId: z.string().optional(),
    workerHostname: z.string().optional(),
    taskText: z.string().optional(),
    error: z.string().optional(),
  }),
);

export type Output = z.infer<ReturnType<typeof outputSchema>>;

export const PeerSendTaskTool = buildTool({
  isConcurrencySafe() {
    return true;
  },
  isReadOnly() {
    return false;
  },
  name: PEER_SEND_TASK_TOOL_NAME,
  searchHint: 'send task to a worker',
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
    if (!input.worker || typeof input.worker !== 'string' || input.worker.length < 1) {
      return { result: false, message: 'worker must be a non-empty hostname or peer ID', errorCode: 1 };
    }
    if (!input.task || typeof input.task !== 'string' || input.task.length < 1) {
      return { result: false, message: 'task must be a non-empty description', errorCode: 1 };
    }
    return { result: true };
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    if (!output.success) return { tool_use_id: toolUseID, type: 'tool_result', content: `[Peer] Failed: ${output.error}` };
    return { tool_use_id: toolUseID, type: 'tool_result', content: `✓ → ${output.workerHostname}: "${output.taskText ?? ''}"` };
  },
  async call(input: { worker: string; task: string }) {
    const store = getGlobalPeerStore();
    let peer: PeerInfo | undefined;

    // Try lookup by port number first
    const portNum = parseInt(input.worker, 10);
    if (!isNaN(portNum)) {
      peer = store.getPeerByPort(portNum);
    }

    // Fallback to hostname/id search
    if (!peer) peer = store.findPeer(input.worker);

    if (!peer) {
      const discovery = getGlobalDiscovery();
      const peers = await discovery.discoverPeers(3000);
      for (const p of peers) store.addPeer(p);
      peer = store.findPeer(input.worker);
      if (!peer && !isNaN(portNum)) peer = store.getPeerByPort(portNum);
    }

    if (!peer) {
      return {
        data: {
          success: false,
          error: `Worker "${input.worker}" not found. Run peer_discover first.`,
        },
      };
    }

    try {
      const url = `http://${peer.ip}:${peer.port}/peer-todo`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'ai-agent', fromName: 'Clew AI', message: input.task }),
      });

      if (!response.ok) {
        return { data: { success: false, error: `Worker ${peer.hostname} responded with HTTP ${response.status}` } };
      }

      const result = await response.json();
      store.addTodo({
        id: result.id ?? `todo_${Date.now()}`,
        from: 'local',
        fromName: 'Me',
        message: `→ ${peer.hostname}: ${input.task}`,
        createdAt: Date.now(),
        status: 'pending',
      });

      return { data: { success: true, taskId: result.id, workerHostname: peer.hostname, taskText: input.task } };
    } catch (err) {
      return { data: { success: false, error: `Failed: ${errorMessage(err)}` } };
    }
  },
});
