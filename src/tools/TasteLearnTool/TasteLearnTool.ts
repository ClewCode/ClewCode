import { z } from 'zod/v4';
import { getTasteRuntime } from '../../services/taste/TasteIntegration.js';
import type { ValidationResult } from '../../Tool.js';
import { buildTool } from '../../Tool.js';
import { getCwd } from '../../utils/cwd.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { DESCRIPTION, PROMPT, TASTE_LEARN_TOOL_NAME } from './prompt.js';

const validKinds = [
  'style',
  'architecture',
  'tooling',
  'testing',
  'naming',
  'security',
  'performance',
  'ui',
  'workflow',
] as const;

const inputSchema = lazySchema(() =>
  z.object({
    text: z.string().describe('Rule description, e.g. "Use const instead of let when possible"'),
    kind: z
      .string()
      .optional()
      .default('style')
      .describe(`Rule category: ${validKinds.join(', ')}`),
    tags: z.array(z.string()).optional().default([]).describe('Optional keywords for semantic matching'),
  }),
);

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean(),
    ruleId: z.string().optional(),
    ruleText: z.string().optional(),
    ruleKind: z.string().optional(),
    error: z.string().optional(),
  }),
);

export type Output = z.infer<ReturnType<typeof outputSchema>>;

export const TasteLearnTool = buildTool({
  isConcurrencySafe() {
    return true;
  },
  isReadOnly() {
    return false;
  },
  name: TASTE_LEARN_TOOL_NAME,
  searchHint: 'teach taste a new coding rule',
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
    if (!input.text || typeof input.text !== 'string' || input.text.length < 3) {
      return { result: false, message: 'text must be a non-empty rule description (min 3 chars)', errorCode: 1 };
    }
    return { result: true };
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    if (!output.success)
      return { tool_use_id: toolUseID, type: 'tool_result', content: `[Taste] Failed: ${output.error}` };
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: `Learned: "${output.ruleText}" [${output.ruleKind}] (id: ${output.ruleId?.slice(0, 12)})`,
    };
  },
  async call(input: { text: string; kind?: string; tags?: string[] }) {
    try {
      const r = getTasteRuntime();
      if (!r.isEnabled()) {
        return { data: { success: false, error: 'Taste is disabled. Enable it with /taste on.' } };
      }

      const kind = (validKinds as readonly string[]).includes(input.kind ?? '') ? input.kind! : 'style';
      const rule = r.addRule(input.text, kind as any, 'manual', input.tags ?? []);
      await r.saveProfile();

      return {
        data: {
          success: true,
          ruleId: rule.id,
          ruleText: rule.text,
          ruleKind: rule.kind,
        },
      };
    } catch (err) {
      return { data: { success: false, error: String(err) } };
    }
  },
});
