import { z } from 'zod/v4';
import type { Tool } from '../../Tool.js';
import { buildTool, type ToolDef } from '../../Tool.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { loadProjectRules, saveProjectRule, removeProjectRule, formatRulesNotification } from '../../utils/projectRules.js';
import { getDescription, getPrompt } from './prompt.js';
import { renderToolResultMessage, renderToolUseMessage } from './UI.js';

const inputSchema = lazySchema(() =>
  z.object({
    action: z
      .enum(['save', 'list', 'remove'])
      .describe('Action to perform: save a new rule, list all rules, or remove a rule by index'),
    rule: z.string().optional().describe('The rule text to save (required for "save" action)'),
    index: z
      .number()
      .int()
      .optional()
      .describe('The 1-based index of the rule to remove (required for "remove" action)'),
  }),
);
type InputSchema = ReturnType<typeof inputSchema>;

const outputSchema = lazySchema(() =>
  z.object({
    message: z.string().describe('Result message'),
    rules: z.array(z.string()).optional().describe('Current list of rules after the operation'),
  }),
);
type OutputSchema = ReturnType<typeof outputSchema>;
export type Output = z.infer<OutputSchema>;

export const ProjectRuleTool: Tool<InputSchema, Output> = buildTool({
  name: 'ProjectRule',
  searchHint: 'save list or remove project-specific rules from auto-observation',
  maxResultSizeChars: 10_000,
  async description() {
    return getDescription();
  },
  async prompt() {
    return getPrompt();
  },
  get inputSchema(): InputSchema {
    return inputSchema();
  },
  get outputSchema(): OutputSchema {
    return outputSchema();
  },
  userFacingName() {
    return 'projectRule';
  },
  shouldDefer: true,
  isEnabled() {
    return true;
  },
  isConcurrencySafe() {
    return true;
  },
  isReadOnly(input) {
    return input.action !== 'save' && input.action !== 'remove';
  },
  renderToolUseMessage,
  renderToolResultMessage,
  async call(input) {
    const { action, rule, index } = input;

    switch (action) {
      case 'save': {
        if (!rule || rule.trim() === '') {
          throw new Error('Rule text is required for "save" action');
        }
        await saveProjectRule(rule.trim());
        const rules = await loadProjectRules();
        return {
          data: {
            message: `Saved rule: "${rule.trim()}"`,
            rules,
          },
        };
      }
      case 'list': {
        const rules = await loadProjectRules();
        if (rules.length === 0) {
          return {
            data: {
              message: 'No project rules saved yet. Use "save" to add rules based on observed user behavior.',
              rules: [],
            },
          };
        }
        return {
          data: {
            message: formatRulesNotification(rules),
            rules,
          },
        };
      }
      case 'remove': {
        if (index === undefined || index === null) {
          throw new Error('Index is required for "remove" action. Use 1-based index from the list.');
        }
        const removed = await removeProjectRule(index - 1);
        if (removed === null) {
          throw new Error(`No rule found at index ${index}`);
        }
        const rules = await loadProjectRules();
        return {
          data: {
            message: `Removed rule ${index}: "${removed}"`,
            rules,
          },
        };
      }
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  },
  mapToolResultToToolResultBlockParam({ message, rules }, toolUseID) {
    const rulesText = rules && rules.length > 0 ? `\n\nCurrent rules:\n${formatRulesNotification(rules)}` : '';
    return {
      type: 'tool_result',
      content: `${message}${rulesText}`,
      tool_use_id: toolUseID,
    };
  },
} satisfies ToolDef<InputSchema, Output>);
