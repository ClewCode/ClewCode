import { z } from 'zod/v4';
import { isCompactV2Enabled } from '../../services/compact/v2/enabled.js';
import { buildTool, type ToolDef } from '../../Tool.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { CONTEXT_RESTORE_TOOL_NAME, DESCRIPTION } from './prompt.js';

/**
 * Cap on how much a single turn may pull back into the window. Without it, a
 * model that sees several stubs can restore them all and immediately recreate
 * the deficit the planner just cleared — an oscillation, not a recovery.
 */
export const RESTORE_BUDGET_TOKENS_PER_TURN = 25_000;

const inputSchema = lazySchema(() =>
  z.strictObject({
    handle: z
      .string()
      .optional()
      .describe('The eviction handle from a stub, e.g. "ev_a91f3c". Omit to list what can be restored.'),
  }),
);
type InputSchema = ReturnType<typeof inputSchema>;

const outputSchema = lazySchema(() =>
  z.object({
    restored: z.boolean().describe('Whether content was returned'),
    handle: z.string().optional(),
    label: z.string().optional(),
    tokens: z.number().optional(),
    content: z.string().optional(),
    available: z
      .array(z.object({ handle: z.string(), label: z.string(), tokens: z.number() }))
      .optional()
      .describe('Restorable evictions, when listing or when the handle was not found'),
    message: z.string().optional(),
  }),
);
type OutputSchema = ReturnType<typeof outputSchema>;

export type Output = z.infer<OutputSchema>;

export const ContextRestoreTool = buildTool({
  name: CONTEXT_RESTORE_TOOL_NAME,
  searchHint: 'bring back evicted conversation content by handle',
  maxResultSizeChars: 400_000,
  async description() {
    return DESCRIPTION;
  },
  userFacingName() {
    return 'ContextRestore';
  },
  getToolUseSummary(input) {
    return input?.handle ?? 'list';
  },
  getActivityDescription(input) {
    return input?.handle ? `Restoring ${input.handle}` : 'Listing evicted context';
  },
  get inputSchema(): InputSchema {
    return inputSchema();
  },
  get outputSchema(): OutputSchema {
    return outputSchema();
  },
  // Only meaningful when v2 is doing the evicting — under the legacy path
  // nothing ever produces a handle, so the tool would be dead weight in the
  // system prompt.
  isEnabled: () => isCompactV2Enabled(),
  isConcurrencySafe() {
    return true;
  },
  isReadOnly() {
    return true;
  },
  async checkPermissions() {
    // Reads only what this session itself evicted — no filesystem or network
    // reach beyond content the model already had.
    return { behavior: 'allow' as const, updatedInput: {} };
  },
  async prompt() {
    return DESCRIPTION;
  },
  async call(input, context) {
    const state = context.compactState;
    if (!state) {
      return {
        data: { restored: false, message: 'No evicted context in this session.' },
      };
    }

    const available = state.evictions.list().map(r => ({ handle: r.handle, label: r.label, tokens: r.tokens }));

    if (!input.handle) {
      return { data: { restored: false, available } };
    }

    const found = state.evictions.get(input.handle);
    if (!found) {
      return {
        data: {
          restored: false,
          message: `Unknown handle "${input.handle}".`,
          available,
        },
      };
    }

    const spent = state.restoredThisTurn + found.record.tokens;
    if (spent > RESTORE_BUDGET_TOKENS_PER_TURN) {
      return {
        data: {
          restored: false,
          handle: found.record.handle,
          label: found.record.label,
          tokens: found.record.tokens,
          message:
            `Restoring this would exceed the per-turn restore budget of ` +
            `${RESTORE_BUDGET_TOKENS_PER_TURN} tokens. Restore it on a later turn, or work from what is in context.`,
        },
      };
    }
    state.restoredThisTurn = spent;

    return {
      data: {
        restored: true,
        handle: found.record.handle,
        label: found.record.label,
        tokens: found.record.tokens,
        content: found.content,
      },
    };
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    if (output.restored && output.content !== undefined) {
      return {
        tool_use_id: toolUseID,
        type: 'tool_result',
        content: `Restored ${output.label ?? output.handle}:\n\n${output.content}`,
      };
    }
    const lines: string[] = [];
    if (output.message) lines.push(output.message);
    if (output.available?.length) {
      lines.push('Available to restore:');
      for (const item of output.available) {
        lines.push(`  ${item.handle} — ${item.label} (~${item.tokens} tokens)`);
      }
    } else if (!output.message) {
      lines.push('Nothing has been evicted from this session.');
    }
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: lines.join('\n'),
    };
  },
} satisfies ToolDef<InputSchema, Output>);
