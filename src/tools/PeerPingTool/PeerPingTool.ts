import { z } from 'zod/v4';
import { buildTool } from '../../Tool.js';
import type { ValidationResult } from '../../Tool.js';
import { getGlobalPeerStore } from '../../peer/PeerStore.js';
import { getGlobalDiscovery } from '../../peer/PeerDiscovery.js';
import { getCwd } from '../../utils/cwd.js';
import { errorMessage } from '../../utils/errors.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { DESCRIPTION, PEER_PING_TOOL_NAME, PROMPT } from './prompt.js';

const inputSchema = lazySchema(() =>
  z.object({
    peer: z.string().describe('Hostname, peer ID, or port number to ping'),
  }),
);

const outputSchema = lazySchema(() =>
  z.object({
    online: z.boolean(),
    hostname: z.string().optional(),
    port: z.number().optional(),
    cwd: z.string().optional(),
    displayName: z.string().optional(),
    role: z.string().optional(),
    error: z.string().optional(),
  }),
);

export type Output = z.infer<ReturnType<typeof outputSchema>>;

export const PeerPingTool = buildTool({
  isConcurrencySafe() { return true; },
  isReadOnly() { return true; },
  name: PEER_PING_TOOL_NAME,
  searchHint: 'ping a peer to check if online',
  maxResultSizeChars: 2_000,
  async description() { return DESCRIPTION; },
  async prompt() { return PROMPT; },
  get inputSchema() { return inputSchema(); },
  get outputSchema() { return outputSchema(); },
  getPath() { return getCwd(); },
  async validateInput(input: any): Promise<ValidationResult> {
    if (!input.peer || typeof input.peer !== 'string' || input.peer.length < 1) {
      return { result: false, message: 'peer must be a non-empty hostname or peer ID', errorCode: 1 };
    }
    return { result: true };
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    if (!output.online) return { tool_use_id: toolUseID, type: 'tool_result', content: `[Peer] Offline: ${output.error}` };
    return { tool_use_id: toolUseID, type: 'tool_result', content: `✓ ${output.hostname}:${output.port} ${output.displayName || ''} ${output.role ? `[${output.role}]` : ''}`.trim() };
  },
  async call(input: { peer: string }) {
    const store = getGlobalPeerStore();
    let peer = store.findPeer(input.peer);

    const portNum = parseInt(input.peer, 10);
    if (!peer && !isNaN(portNum)) peer = store.getPeerByPort(portNum);

    if (!peer) {
      const discovery = getGlobalDiscovery();
      const peers = await discovery.discoverPeers(3000);
      for (const p of peers) store.addPeer(p);
      peer = store.findPeer(input.peer);
      if (!peer && !isNaN(portNum)) peer = store.getPeerByPort(portNum);
    }

    if (!peer) {
      return { data: { online: false, error: `Peer "${input.peer}" not found` } };
    }

    try {
      const url = `http://${peer.ip}:${peer.port}/peer-info`;
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) {
        return { data: { online: false, error: `HTTP ${response.status}` } };
      }
      const info = await response.json();
      return {
        data: {
          online: true,
          hostname: info.hostname,
          port: info.port,
          cwd: info.cwd,
          displayName: info.displayName,
          role: info.role,
        },
      };
    } catch (err) {
      return { data: { online: false, error: errorMessage(err) } };
    }
  },
});
