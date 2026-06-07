import { z } from 'zod/v4';
import { buildTool } from '../../Tool.js';
import { getGlobalPeerStore } from '../../peer/PeerStore.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { DESCRIPTION, PEER_LIST_TASKS_TOOL_NAME, PROMPT } from './prompt.js';

const inputSchema = lazySchema(() => z.object({}));

const outputSchema = lazySchema(() =>
  z.object({
    tasks: z
      .array(
        z.object({
          id: z.string(),
          from: z.string(),
          fromName: z.string(),
          message: z.string(),
          status: z.enum(['pending', 'done', 'rejected']),
          createdAt: z.number(),
        }),
      ),
    count: z.number(),
    pending: z.number(),
    total: z.number(),
  }),
);

export type Output = z.infer<ReturnType<typeof outputSchema>>;

export const PeerListTasksTool = buildTool({
  isConcurrencySafe() {
    return true;
  },
  isReadOnly() {
    return true;
  },
  name: PEER_LIST_TASKS_TOOL_NAME,
  searchHint: 'list peer tasks',
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
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    if (!output.tasks || output.tasks.length === 0) return { tool_use_id: toolUseID, type: 'tool_result', content: 'No tasks.' };
    return { tool_use_id: toolUseID, type: 'tool_result', content: `✓ ${output.pending}/${output.total} pending: ` + output.tasks.map((t: any) => `${t.status[0]?.toUpperCase() || '?'}:${t.fromName}: ${t.message}`).join(' | ') };
  },
  async call() {
    const todos = getGlobalPeerStore().getTodos();
    return {
      data: {
        tasks: todos.map(t => ({
          id: t.id,
          from: t.from,
          fromName: t.fromName,
          message: t.message,
          status: t.status,
          createdAt: t.createdAt,
        })),
        count: todos.length,
        pending: todos.filter(t => t.status === 'pending').length,
        total: todos.length,
      },
    };
  },
});
