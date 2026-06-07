import { z } from 'zod/v4';
import { buildTool } from '../../Tool.js';
import { getGlobalPeerStore } from '../../peer/PeerStore.js';
import { getCwd } from '../../utils/cwd.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { DESCRIPTION, PEER_LIST_MESSAGES_TOOL_NAME, PROMPT } from './prompt.js';

const inputSchema = lazySchema(() => z.object({}));

const outputSchema = lazySchema(() =>
  z.object({
    messages: z.array(z.object({
      from: z.string(),
      fromName: z.string(),
      text: z.string(),
      timestamp: z.number(),
    })),
    count: z.number(),
  }),
);

export type Output = z.infer<ReturnType<typeof outputSchema>>;

export const PeerListMessagesTool = buildTool({
  isConcurrencySafe() { return true; },
  isReadOnly() { return true; },
  name: PEER_LIST_MESSAGES_TOOL_NAME,
  searchHint: 'list peer messages',
  maxResultSizeChars: 5_000,
  async description() { return DESCRIPTION; },
  async prompt() { return PROMPT; },
  get inputSchema() { return inputSchema(); },
  get outputSchema() { return outputSchema(); },
  getPath() { return getCwd(); },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    if (!output.messages || output.messages.length === 0) return { tool_use_id: toolUseID, type: 'tool_result', content: 'No messages.' };
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: output.messages.map((m: any) =>
        `[${new Date(m.timestamp).toLocaleTimeString()}] ${m.fromName}: ${m.text}`
      ).join('\n'),
    };
  },
  async call() {
    const store = getGlobalPeerStore();
    const messages = store.getMessages();
    return {
      data: {
        messages: messages.map(m => ({
          from: m.from,
          fromName: m.fromName,
          text: m.text,
          timestamp: m.timestamp,
        })),
        count: messages.length,
      },
    };
  },
});
