import { z } from 'zod/v4';
import { buildTool } from '../../Tool.js';
import { getGlobalPeerStore } from '../../peer/PeerStore.js';
import { getCwd } from '../../utils/cwd.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { DESCRIPTION, PEER_LIST_ROLES_TOOL_NAME, PROMPT } from './prompt.js';

const inputSchema = lazySchema(() => z.object({}));

const outputSchema = lazySchema(() =>
  z.object({
    workers: z.array(z.object({
      hostname: z.string(),
      displayName: z.string().optional(),
      role: z.string().optional(),
      ip: z.string(),
      cwd: z.string(),
    })),
    count: z.number(),
  }),
);

export type Output = z.infer<ReturnType<typeof outputSchema>>;

export const PeerListRolesTool = buildTool({
  isConcurrencySafe() { return true; },
  isReadOnly() { return true; },
  name: PEER_LIST_ROLES_TOOL_NAME,
  searchHint: 'list peer roles',
  maxResultSizeChars: 5_000,
  async description() { return DESCRIPTION; },
  async prompt() { return PROMPT; },
  get inputSchema() { return inputSchema(); },
  get outputSchema() { return outputSchema(); },
  getPath() { return getCwd(); },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    if (!output.workers || output.workers.length === 0) return { tool_use_id: toolUseID, type: 'tool_result', content: 'No peers joined.' };
    return { tool_use_id: toolUseID, type: 'tool_result', content: output.workers.map((w: any) => `${(w.displayName || w.hostname).padEnd(20)} ${(w.role || '-').padEnd(12)} ${w.ip}`).join('\n') };
  },
  async call() {
    const store = getGlobalPeerStore();
    const peers = store.getPeers();
    const allTags = store.getAllPeerTags();
    const tagMap = new Map(allTags.map(t => [t.peerId, t.tags]));

    return {
      data: {
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
      },
    };
  },
});
