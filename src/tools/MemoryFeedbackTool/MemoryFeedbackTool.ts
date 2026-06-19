import { z } from 'zod/v4';
import { ensureMemorySystem } from '../../memory/autoInit.js';
import { MemoryDB } from '../../memory/database.js';
import { applyFeedback } from '../../memory/feedback.js';
import { getMemoryDbPath, initMemoryHierarchy } from '../../memory/hierarchy.js';
import { buildTool } from '../../Tool.js';
import { getCwd } from '../../utils/cwd.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { DESCRIPTION, MEMORY_FEEDBACK_TOOL_NAME, PROMPT } from './prompt.js';

const inputSchema = lazySchema(() =>
  z.object({
    memoryIdOrKey: z.string().describe('Memory ID or key to give feedback on'),
    signal: z
      .string()
      .describe(
        'Feedback signal: accepted, rejected, corrected, preferred, disliked, important, wrong (or alias: correct, incorrect, like, dislike)',
      ),
    note: z.string().optional().describe('Optional note (e.g. what was corrected, or preference text for preferred)'),
  }),
);

export const MemoryFeedbackTool = buildTool({
  isConcurrencySafe() {
    return true;
  },
  isReadOnly() {
    return false;
  },
  name: MEMORY_FEEDBACK_TOOL_NAME,
  searchHint: 'give feedback on memories',
  maxResultSizeChars: 2000,
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
    return lazySchema(() =>
      z.object({
        success: z.boolean(),
        message: z.string(),
        importanceDelta: z.number(),
        confidenceDelta: z.number(),
        wroteToTaste: z.boolean(),
      }),
    )();
  },
  getPath() {
    return getCwd();
  },
  userFacingName() {
    return 'MemoryFeedback';
  },
  renderToolUseMessage(input) {
    return `feedback: ${input.signal} on ${input.memoryIdOrKey}`;
  },
  renderToolResultMessage(output: any) {
    return output.success ? `${output.message}` : `Failed: ${output.message}`;
  },
  mapToolResultToToolResultBlockParam(output: any, toolUseID: string) {
    if (!output.success)
      return { tool_use_id: toolUseID, type: 'tool_result', content: `[Feedback] ${output.message}` };
    const parts = [`✓ ${output.message}`];
    if (output.importanceDelta)
      parts.push(`importance ${output.importanceDelta > 0 ? '+' : ''}${output.importanceDelta}`);
    if (output.confidenceDelta)
      parts.push(`confidence ${output.confidenceDelta > 0 ? '+' : ''}${output.confidenceDelta}`);
    if (output.wroteToTaste) parts.push('saved to TASTE.md');
    return { tool_use_id: toolUseID, type: 'tool_result', content: parts.join(' · ') };
  },
  async call(input: { memoryIdOrKey: string; signal: string; note?: string }) {
    try {
      await ensureMemorySystem();
      const result = await applyFeedback(input.memoryIdOrKey, input.signal as any, input.note);
      return { data: result };
    } catch (err: any) {
      return {
        data: { success: false, message: err.message, importanceDelta: 0, confidenceDelta: 0, wroteToTaste: false },
      };
    }
  },
});
