import { z } from 'zod/v4';
import { getGlobalPeerStore } from '../../peer/PeerStore.js';
import { buildTool } from '../../Tool.js';
import { getCwd } from '../../utils/cwd.js';
import { errorMessage } from '../../utils/errors.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { notifyPeerFeedback, truncateText } from '../peer/peerFeedback.js';
import { DESCRIPTION, PEER_JOIN_TOOL_NAME, PROMPT } from './prompt.js';

const inputSchema = lazySchema(() =>
  z.object({
    host: z.string().optional().default('127.0.0.1').describe('Hostname or IP (default: 127.0.0.1)'),
    port: z.number().describe('Port number of the peer to join'),
  }),
);

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean(),
    peerHostname: z.string().optional(),
    peerPort: z.number().optional(),
    displayName: z.string().optional(),
    role: z.string().optional(),
    shell: z.string().optional(),
    cwd: z.string().optional(),
    error: z.string().optional(),
  }),
);

export type Output = z.infer<ReturnType<typeof outputSchema>>;

export const PeerJoinTool = buildTool({
  isConcurrencySafe() {
    return true;
  },
  isReadOnly() {
    return false;
  },
  name: PEER_JOIN_TOOL_NAME,
  searchHint: 'join a peer',
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
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    if (!output.success) return { tool_use_id: toolUseID, type: 'tool_result', content: `Failed to join peer: ${output.error}` };
    const extra = [output.displayName, output.role, output.shell].filter(Boolean).join(' ');
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: `✓ joined ${output.peerHostname}:${output.peerPort}${extra ? ` (${extra})` : ''}`,
    };
  },
  async call(input: { host?: string; port: number }) {
    const host = input.host || '127.0.0.1';
    notifyPeerFeedback(`joining ${host}:${input.port}`, 'peer-join', 'low');
    try {
      const url = `http://${host}:${input.port}/peer-info`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const info = await res.json();
      const store = getGlobalPeerStore();
      store.addConnection({
        id: info.id ?? `${host}:${input.port}`,
        hostname: info.hostname ?? host,
        ip: info.ip ?? host,
        port: info.port ?? input.port,
        cwd: info.cwd ?? '',
        version: info.version ?? '',
        lastSeen: Date.now(),
        status: 'online',
        shell: info.shell,
        platform: info.platform,
        term: info.term,
      });
      // Copy display name and role if present
      if (info.displayName) store.setPeerName(info.id, info.displayName);
      if (info.role) store.setPeerRole(info.id, info.role);
      notifyPeerFeedback(`joined ${info.hostname ?? host}:${info.port ?? input.port}`, 'peer-join-result', 'medium');
      return {
        data: {
          success: true,
          peerHostname: info.hostname ?? host,
          peerPort: info.port ?? input.port,
          displayName: info.displayName,
          role: info.role,
          shell: info.shell,
          cwd: info.cwd,
        },
      };
    } catch (err) {
      const error = errorMessage(err);
      notifyPeerFeedback(`join failed: ${truncateText(error, 120)}`, 'peer-join-error', 'high');
      return { data: { success: false, error: `Failed: ${error}` } };
    }
  },
});
