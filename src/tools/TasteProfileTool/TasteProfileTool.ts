import { z } from 'zod/v4';
import { getTasteRuntime } from '../../services/taste/TasteIntegration.js';
import { buildTool } from '../../Tool.js';
import { getCwd } from '../../utils/cwd.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { DESCRIPTION, PROMPT, TASTE_PROFILE_TOOL_NAME } from './prompt.js';

const inputSchema = lazySchema(() => z.object({}));

const outputSchema = lazySchema(() =>
  z.object({
    rules: z.array(
      z.object({
        id: z.string(),
        kind: z.string(),
        text: z.string(),
        confidence: z.number(),
        source: z.string(),
        tags: z.array(z.string()),
      }),
    ),
    count: z.number(),
    enabled: z.boolean(),
  }),
);

export type Output = z.infer<ReturnType<typeof outputSchema>>;

export const TasteProfileTool = buildTool({
  isConcurrencySafe() {
    return true;
  },
  isReadOnly() {
    return true;
  },
  name: TASTE_PROFILE_TOOL_NAME,
  searchHint: 'show taste rules',
  maxResultSizeChars: 10_000,
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
    if (!output.enabled)
      return { tool_use_id: toolUseID, type: 'tool_result', content: '[Taste] Disabled. Run /taste on to enable.' };
    if (output.rules.length === 0) return { tool_use_id: toolUseID, type: 'tool_result', content: '[Taste] No rules.' };
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: output.rules
        .map(
          (r: any) =>
            `${r.id.slice(0, 12)}  ${r.kind.padEnd(12)}  ${r.confidence.toFixed(0).padStart(3)}%  ${r.source.padEnd(8)}  ${r.text}${r.tags.length ? ` [${r.tags.join(',')}]` : ''}`,
        )
        .join('\n'),
    };
  },
  async call() {
    const r = getTasteRuntime();
    const enabled = r.isEnabled();
    const rules = enabled ? r.getRules() : [];
    return {
      data: {
        rules: rules.map(r => ({
          id: r.id,
          kind: r.kind,
          text: r.text,
          confidence: Math.round(r.confidence * 100),
          source: r.source,
          tags: r.tags,
        })),
        count: rules.length,
        enabled,
      },
    };
  },
});
