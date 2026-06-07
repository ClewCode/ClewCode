import { z } from 'zod/v4';
import { buildTool } from '../../Tool.js';
import { getTasteRuntime } from '../../services/taste/TasteIntegration.js';
import { getCwd } from '../../utils/cwd.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { DESCRIPTION, TASTE_SUGGEST_TOOL_NAME, PROMPT } from './prompt.js';

const inputSchema = lazySchema(() => z.object({}));

const outputSchema = lazySchema(() =>
  z.object({
    suggestions: z.array(z.object({
      id: z.string(),
      text: z.string(),
      kind: z.string(),
      confidence: z.number(),
      frequency: z.number(),
      seen: z.boolean(),
    })),
    count: z.number(),
    enabled: z.boolean(),
  }),
);

export type Output = z.infer<ReturnType<typeof outputSchema>>;

export const TasteSuggestTool = buildTool({
  isConcurrencySafe() { return true; },
  isReadOnly() { return true; },
  name: TASTE_SUGGEST_TOOL_NAME,
  searchHint: 'view taste suggestions',
  maxResultSizeChars: 5_000,
  async description() { return DESCRIPTION; },
  async prompt() { return PROMPT; },
  get inputSchema() { return inputSchema(); },
  get outputSchema() { return outputSchema(); },
  getPath() { return getCwd(); },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    if (!output.enabled) return { tool_use_id: toolUseID, type: 'tool_result', content: '[Taste] Disabled.' };
    if (output.suggestions.length === 0) return { tool_use_id: toolUseID, type: 'tool_result', content: '[Taste] No pending suggestions.' };
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: output.suggestions.map((s: any) =>
        `${s.id.slice(0, 12)}  ${s.kind.padEnd(12)}  ${s.confidence.toFixed(0).padStart(3)}%  ${s.frequency}x  ${s.text}`
      ).join('\n'),
    };
  },
  async call() {
    const r = getTasteRuntime();
    const enabled = r.isEnabled();
    if (!enabled) {
      return { data: { suggestions: [], count: 0, enabled: false } };
    }

    const autoLearn = r.getAutoLearn();
    const suggestions = autoLearn.getPendingSuggestions();

    return {
      data: {
        suggestions: suggestions.map(s => ({
          id: s.id,
          text: s.pattern.text,
          kind: s.pattern.kind,
          confidence: Math.round(s.pattern.confidence * 100),
          frequency: s.pattern.frequency,
          seen: s.seen,
        })),
        count: suggestions.length,
        enabled,
      },
    };
  },
});
