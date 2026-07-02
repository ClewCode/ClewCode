import { z } from 'zod/v4';
import { importPeerMemories } from '../../memory/peerSync.js';
import { getGlobalDiscovery } from '../../peer/PeerDiscovery.js';
import { getGlobalPeerStore } from '../../peer/PeerStore.js';
import type { ValidationResult } from '../../Tool.js';
import { buildTool } from '../../Tool.js';
import { getCwd } from '../../utils/cwd.js';
import { errorMessage } from '../../utils/errors.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { notifyPeerFeedback } from '../peer/peerFeedback.js';
import { DESCRIPTION, PEER_MEMORY_SYNC_TOOL_NAME, PROMPT } from './prompt.js';

const inputSchema = lazySchema(() =>
  z.object({
    peer: z.string().describe('Hostname, peer ID, display name, or port number of the peer node to sync from'),
    limit: z.number().optional().default(50).describe('Max memories to fetch from the peer (default: 50, max: 200)'),
  }),
);

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean(),
    peer: z.string().optional().describe('Resolved peer hostname'),
    fetched: z.number().optional().describe('Memories received from the peer'),
    imported: z.number().optional().describe('New memories created locally'),
    reinforced: z.number().optional().describe('Duplicates that reinforced existing memories'),
    skipped: z.number().optional().describe('Invalid records skipped'),
    error: z.string().optional(),
  }),
);

export type Output = z.infer<ReturnType<typeof outputSchema>>;

export const PeerMemorySyncTool = buildTool({
  isConcurrencySafe() {
    return false;
  },
  isReadOnly() {
    return false;
  },
  name: PEER_MEMORY_SYNC_TOOL_NAME,
  searchHint: 'sync memories from a peer node',
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
    if (!input.peer || typeof input.peer !== 'string' || input.peer.length < 1) {
      return { result: false, message: 'peer must be a non-empty hostname or peer ID', errorCode: 1 };
    }
    return { result: true };
  },
  renderToolUseMessage(input) {
    return `sync memories from peer ${input.peer}`;
  },
  renderToolResultMessage(output) {
    if (!output.success) return output.error ?? 'Memory sync failed.';
    return `Synced from ${output.peer}: ${output.imported} new, ${output.reinforced} reinforced (${output.fetched} fetched).`;
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: output.success
        ? `✓ ${output.imported} imported, ${output.reinforced} reinforced, ${output.skipped} skipped (from ${output.peer})`
        : `Memory sync failed: ${output.error}`,
    };
  },
  async call(input: { peer: string; limit?: number }) {
    const store = getGlobalPeerStore();
    const limit = Math.min(Math.max(1, input.limit ?? 50), 200);

    notifyPeerFeedback(`syncing memories from ${input.peer}`, 'peer-memory-sync', 'low');

    // Resolve the peer (same lookup order as other peer tools)
    let peer = store.findPeer(input.peer);
    const portNum = parseInt(input.peer, 10);
    if (!peer && !Number.isNaN(portNum)) peer = store.getPeerByPort(portNum);
    if (!peer) {
      const discovery = getGlobalDiscovery();
      const peers = await discovery.discoverPeers(3000);
      for (const p of peers) store.addPeer(p);
      store.populateTokensFromDiscovery(discovery);
      peer = store.findPeer(input.peer);
      if (!peer && !Number.isNaN(portNum)) peer = store.getPeerByPort(portNum);
    }
    if (!peer) {
      const error = `Peer "${input.peer}" not found. Run peer_discover first.`;
      notifyPeerFeedback(error, 'peer-memory-sync-result', 'high');
      return { data: { success: false, error } };
    }

    const discovery = getGlobalDiscovery();
    const token = store.getPeerToken(peer.id) || discovery.getPeerToken(peer.id) || '';

    try {
      const url = `http://${peer.ip || '127.0.0.1'}:${peer.port}/peer-memory-export?token=${encodeURIComponent(token)}&limit=${limit}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) {
        const error = `Peer returned HTTP ${res.status}`;
        notifyPeerFeedback(error, 'peer-memory-sync-result', 'high');
        return { data: { success: false, peer: peer.hostname, error } };
      }
      const payload = await res.json();
      const records = Array.isArray(payload?.memories) ? payload.memories : [];

      const result = await importPeerMemories(records, peer.hostname);
      notifyPeerFeedback(
        `synced ${result.imported} new / ${result.reinforced} reinforced from ${peer.hostname}`,
        'peer-memory-sync-result',
        'medium',
      );
      return { data: { success: true, peer: peer.hostname, ...result } };
    } catch (err) {
      const error = errorMessage(err);
      notifyPeerFeedback(`sync failed: ${error}`, 'peer-memory-sync-result', 'high');
      return { data: { success: false, peer: peer.hostname, error } };
    }
  },
});
