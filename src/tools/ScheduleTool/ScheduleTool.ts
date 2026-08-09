/**
 * Schedule — one tool for everything time-based.
 *
 * Four separate tools shipped for this (CronCreate, CronDelete, CronList,
 * ScheduleFollowup), which is four descriptions in every prompt for what the
 * model thinks of as a single capability: "do this later". The split also hid
 * the most useful one — a model reaching for "remind me later" tends to find
 * CronCreate and hand future-self a bare prompt, when ScheduleFollowup carries
 * the working context forward.
 *
 * Facade over the existing tools: schedules, IDs, persistence and the cron
 * scheduler itself are untouched.
 */
import { z } from 'zod/v4';
import { buildTool, type ToolDef, type ToolUseContext } from '../../Tool.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { CronCreateTool } from '../ScheduleCronTool/CronCreateTool.js';
import { CronDeleteTool } from '../ScheduleCronTool/CronDeleteTool.js';
import { CronListTool } from '../ScheduleCronTool/CronListTool.js';
import { isKairosCronEnabled } from '../ScheduleCronTool/prompt.js';
import { ScheduleFollowupTool } from '../ScheduleFollowupTool/ScheduleFollowupTool.js';
import { DESCRIPTION, PROMPT, SCHEDULE_TOOL_NAME } from './prompt.js';

export const SCHEDULE_ACTIONS = ['followup', 'create', 'list', 'delete'] as const;
export type ScheduleAction = (typeof SCHEDULE_ACTIONS)[number];

const inputSchema = lazySchema(() =>
  z.object({
    action: z.enum(SCHEDULE_ACTIONS).describe('followup | create | list | delete — see the tool prompt.'),
    summary: z.string().optional().describe('followup: one line on what you were doing and are leaving unfinished.'),
    remaining: z
      .string()
      .optional()
      .describe(
        'followup: the concrete next steps, written to future-you. Be specific so you can resume without re-deriving.',
      ),
    delayMinutes: z
      .number()
      .optional()
      .describe('followup: minutes from now to come back (1–10080, i.e. up to 7 days).'),
    cron: z
      .string()
      .optional()
      .describe('create: 5-field cron in local time — "M H DoM Mon DoW" (e.g. "*/5 * * * *", "30 14 28 2 *").'),
    prompt: z.string().optional().describe('create: the prompt to enqueue at each fire time.'),
    recurring: z
      .boolean()
      .optional()
      .describe('create: true (default) fires on every match; false fires once at the next match then deletes itself.'),
    durable: z
      .boolean()
      .optional()
      .describe(
        'create/followup: true persists to .clew/scheduled_tasks.json and survives restarts. Default false (session-only).',
      ),
    id: z.string().optional().describe('delete: the job ID returned by create or shown by list.'),
  }),
);
type InputSchema = ReturnType<typeof inputSchema>;
export type ScheduleInput = z.infer<InputSchema>;

const outputSchema = lazySchema(() =>
  z.object({
    action: z.string(),
    ok: z.boolean(),
    result: z.string(),
  }),
);
type OutputSchema = ReturnType<typeof outputSchema>;
export type ScheduleOutput = z.infer<OutputSchema>;

type Delegate = {
  call: (input: never, context: never) => unknown;
  validateInput?: (input: never, context: never) => Promise<{ result: true } | { result: false; message: string }>;
  mapToolResultToToolResultBlockParam?: (output: never, toolUseID: string) => { content?: unknown };
};

export const REQUIRED_FIELDS: Record<ScheduleAction, readonly (keyof ScheduleInput)[]> = {
  followup: ['summary', 'delayMinutes'],
  create: ['cron', 'prompt'],
  list: [],
  delete: ['id'],
};

export function missingFieldsFor(input: ScheduleInput): string[] {
  return REQUIRED_FIELDS[input.action].filter(field => input[field] === undefined || input[field] === '');
}

export function buildDelegateCall(input: ScheduleInput): { tool: Delegate; args: Record<string, unknown> } {
  switch (input.action) {
    case 'followup':
      return {
        tool: ScheduleFollowupTool as unknown as Delegate,
        args: {
          summary: input.summary,
          remaining: input.remaining,
          delayMinutes: input.delayMinutes,
          durable: input.durable,
        },
      };
    case 'create':
      return {
        tool: CronCreateTool as unknown as Delegate,
        args: {
          cron: input.cron,
          prompt: input.prompt,
          recurring: input.recurring ?? true,
          durable: input.durable ?? false,
        },
      };
    case 'list':
      return { tool: CronListTool as unknown as Delegate, args: {} };
    case 'delete':
      return { tool: CronDeleteTool as unknown as Delegate, args: { id: input.id } };
  }
}

function renderDelegateResult(tool: Delegate, data: unknown): string {
  const rendered = tool.mapToolResultToToolResultBlockParam?.(data as never, 'schedule');
  const content = rendered?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map(block => (typeof block === 'string' ? block : ((block as { text?: string }).text ?? JSON.stringify(block))))
      .join('\n');
  }
  return typeof data === 'string' ? data : JSON.stringify(data, null, 2);
}

export const ScheduleTool = buildTool({
  name: SCHEDULE_TOOL_NAME,
  searchHint: 'schedule work for later: follow-up, cron job, list, delete',
  maxResultSizeChars: 100_000,
  async description() {
    return DESCRIPTION;
  },
  async prompt() {
    return PROMPT;
  },
  userFacingName() {
    return 'Schedule';
  },
  isEnabled() {
    return isKairosCronEnabled();
  },
  getToolUseSummary(input) {
    if (!input?.action) return '';
    if (input.action === 'followup') return `+${input.delayMinutes ?? '?'}m: ${input.summary ?? ''}`;
    if (input.action === 'create') return `${input.cron ?? ''}: ${input.prompt ?? ''}`;
    if (input.action === 'delete') return input.id ?? '';
    return 'list';
  },
  getActivityDescription(input) {
    switch (input?.action) {
      case 'followup':
        return 'Scheduling a follow-up';
      case 'create':
        return 'Creating a scheduled job';
      case 'delete':
        return 'Deleting a scheduled job';
      default:
        return 'Listing scheduled jobs';
    }
  },
  get inputSchema(): InputSchema {
    return inputSchema();
  },
  get outputSchema(): OutputSchema {
    return outputSchema();
  },
  isConcurrencySafe() {
    return false;
  },
  isReadOnly() {
    return false;
  },
  toAutoClassifierInput(input) {
    return `${input.action}: ${input.summary ?? input.prompt ?? input.id ?? ''}`;
  },
  async checkPermissions() {
    return { behavior: 'allow' as const, updatedInput: {} };
  },
  async call(input, context) {
    const missing = missingFieldsFor(input);
    if (missing.length > 0) {
      return {
        data: {
          action: input.action,
          ok: false,
          result: `"${input.action}" needs: ${missing.join(', ')}. Nothing was scheduled.`,
        },
      };
    }
    const { tool, args } = buildDelegateCall(input);
    try {
      const validation = await tool.validateInput?.(args as never, context as never);
      if (validation?.result === false) {
        return { data: { action: input.action, ok: false, result: validation.message } };
      }
      const raw = await (tool.call as (a: unknown, c: unknown) => unknown)(args, context as ToolUseContext);
      const data = raw && typeof raw === 'object' && 'data' in raw ? (raw as { data: unknown }).data : raw;
      return { data: { action: input.action, ok: true, result: renderDelegateResult(tool, data) } };
    } catch (err) {
      return {
        data: {
          action: input.action,
          ok: false,
          result: `schedule ${input.action} failed: ${err instanceof Error ? err.message : String(err)}`,
        },
      };
    }
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    return { tool_use_id: toolUseID, type: 'tool_result', content: output.result };
  },
} satisfies ToolDef<InputSchema, ScheduleOutput>);
