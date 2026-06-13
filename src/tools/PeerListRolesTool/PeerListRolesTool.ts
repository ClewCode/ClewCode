import { z } from 'zod/v4';
import { getGlobalDiscovery } from '../../peer/PeerDiscovery.js';
import { getGlobalPeerStore } from '../../peer/PeerStore.js';
import { buildTool } from '../../Tool.js';
import { getCwd } from '../../utils/cwd.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { notifyPeerFeedback } from '../peer/peerFeedback.js';
import { DESCRIPTION, PEER_LIST_ROLES_TOOL_NAME, PROMPT } from './prompt.js';

const inputSchema = lazySchema(() =>
  z.object({
    wait: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        'If true, wait up to `timeout` seconds for at least 1 peer to appear. Use instead of polling in a loop.',
      ),
    timeout: z
      .number()
      .optional()
      .default(30)
      .describe('Max seconds to wait when `wait` is true (default: 30, max: 120).'),
    minPeers: z
      .number()
      .optional()
      .default(1)
      .describe('Minimum number of peers to wait for when `wait` is true (default: 1).'),
  }),
);

const outputSchema = lazySchema(() =>
  z.object({
    workers: z.array(
      z.object({
        hostname: z.string(),
        displayName: z.string().optional(),
        role: z.string().optional(),
        ip: z.string(),
        cwd: z.string(),
      }),
    ),
    count: z.number(),
    waited: z.boolean().optional().describe('Whether the tool waited for peers to appear'),
    timedOut: z.boolean().optional().describe('Whether the wait timed out without enough peers'),
  }),
);

export type Output = z.infer<ReturnType<typeof outputSchema>>;

export const PeerListRolesTool = buildTool({
  isConcurrencySafe() {
    return true;
  },
  isReadOnly() {
    return true;
  },
  name: PEER_LIST_ROLES_TOOL_NAME,
  searchHint: 'list peer roles',
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
    if (!output.workers || output.workers.length === 0) {
      let content = 'No peers joined.';
      if (output.waited && output.timedOut) content = 'Waited for peers but none appeared before timeout.';
      else if (output.waited) content = 'No peers yet; still waiting.';
      return { tool_use_id: toolUseID, type: 'tool_result', content };
    }
    let prefix = `✓ ${output.count} peer(s)`;
    if (output.waited && !output.timedOut) prefix = `✓ ${output.count} peer(s) appeared after waiting`;
    else if (output.waited) prefix = `⌛ ${output.count} peer(s) found before timeout`;
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content:
        `${prefix}: ` +
        output.workers.map((w: any) => `${w.displayName || w.hostname}${w.role ? `[${w.role}]` : ''}`).join(', '),
    };
  },
  async call(input: { wait?: boolean; timeout?: number; minPeers?: number }) {
    const store = getGlobalPeerStore();
    const minPeers = input.minPeers ?? 1;
    const timeoutMs = Math.min(Math.max(1, input.timeout ?? 30), 120) * 1000;

    notifyPeerFeedback(
      input.wait ? `waiting up to ${Math.round(timeoutMs / 1000)}s for peer roles` : 'reading peer roles',
      'peer-list-roles',
      'low',
    );

    // Helper to build response data from current store
    const buildData = (waited?: boolean, timedOut?: boolean) => {
      const peers = store.getPeers();
      const allTags = store.getAllPeerTags();
      const tagMap = new Map(allTags.map(t => [t.peerId, t.tags]));
      return {
        workers: peers.map(p => {
          const tags = tagMap.get(p.id);
          return {
            hostname: p.hostname,
            displayName: tags?.displayName,
            role: tags?.role,
            ip: p.ip,
            cwd: p.cwd,
          };
        }),
        count: peers.length,
        waited,
        timedOut,
      };
    };

    // Check current peers
    if (store.getPeers().length >= minPeers) {
      return { data: buildData() };
    }

    // If `wait` is true, re-discover and retry
    let waited = false;
    let timedOut = false;
    if (input.wait) {
      waited = true;
      const deadline = Date.now() + timeoutMs;
      const retryInterval = 2000;

      while (Date.now() < deadline) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) break;

        // Re-discover peers
        try {
          const discovery = getGlobalDiscovery();
          const peers = await discovery.discoverPeers(3000);
          for (const p of peers) store.addPeer(p);
        } catch {
          /* best-effort */
        }

        if (store.getPeers().length >= minPeers) break;
        await new Promise(resolve => setTimeout(resolve, Math.min(retryInterval, remaining)));
      }

      // One final check
      try {
        const discovery = getGlobalDiscovery();
        const peers2 = await discovery.discoverPeers(3000);
        for (const p of peers2) store.addPeer(p);
      } catch {
        /* best-effort */
      }

      if (store.getPeers().length < minPeers) {
        timedOut = true;
      }
    }

    const data = buildData(waited, timedOut);
    notifyPeerFeedback(
      data.count > 0 ? `found ${data.count} peer role(s)` : 'no peer roles found',
      'peer-list-roles-result',
      data.count > 0 ? 'medium' : 'low',
    );
    return { data };
  },
});
