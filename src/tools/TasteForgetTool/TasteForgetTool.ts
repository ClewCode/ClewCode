import { z } from 'zod/v4';
import { buildTool } from '../../Tool.js';
import type { ValidationResult } from '../../Tool.js';
import { getTasteRuntime } from '../../services/taste/TasteIntegration.js';
import { getCwd } from '../../utils/cwd.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { DESCRIPTION, TASTE_FORGET_TOOL_NAME, PROMPT } from './prompt.js';

const inputSchema = lazySchema(() =>
  z.object({
    ruleId: z.string().describe('The ID of the rule to remove (from taste_profile output)'),
  }),
);

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean(),
    removedId: z.string().optional(),
    error: z.string().optional(),
  }),
);

export type Output = z.infer<ReturnType<typeof outputSchema>>;

export const TasteForgetTool = buildTool({
  isConcurrencySafe() { return true; },
  isReadOnly() { return false; },
  name: TASTE_FORGET_TOOL_NAME,
  searchHint: 'remove a taste rule',
  maxResultSizeChars: 1_000,
  async description() { return DESCRIPTION; },
  async prompt() { return PROMPT; },
  get inputSchema() { return inputSchema(); },
  get outputSchema() { return outputSchema(); },
  getPath() { return getCwd(); },
  async validateInput(input: any): Promise<ValidationResult> {
    if (!input.ruleId || typeof input.ruleId !== 'string' || input.ruleId.length < 1) {
      return { result: false, message: 'ruleId must be a non-empty rule ID string', errorCode: 1 };
    }
    return { result: true };
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    if (!output.success) return { tool_use_id: toolUseID, type: 'tool_result', content: `[Taste] Failed: ${output.error}` };
    return { tool_use_id: toolUseID, type: 'tool_result', content: `Forgot rule ${output.removedId?.slice(0, 12)}` };
  },
  async call(input: { ruleId: string }) {
    try {
      const r = getTasteRuntime();
      if (!r.isEnabled()) {
        return { data: { success: false, error: 'Taste is disabled.' } };
      }

      const removed = r.removeRule(input.ruleId);
      if (!removed) {
        return { data: { success: false, error: `Rule "${input.ruleId}" not found. Use taste_profile to see available rules.` } };
      }

      await r.saveProfile();
      return { data: { success: true, removedId: input.ruleId } };
    } catch (err) {
      return { data: { success: false, error: String(err) } };
    }
  },
});
