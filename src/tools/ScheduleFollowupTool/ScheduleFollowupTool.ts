import { z } from 'zod/v4';
import { setScheduledTasksEnabled } from '../../bootstrap/state.js';
import type { ValidationResult } from '../../Tool.js';
import { buildTool, type ToolDef } from '../../Tool.js';
import { addCronTask, listAllCronTasks } from '../../utils/cronTasks.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { semanticBoolean } from '../../utils/semanticBoolean.js';
import { getTeammateContext } from '../../utils/teammateContext.js';
import { isDurableCronEnabled, isKairosCronEnabled } from '../ScheduleCronTool/prompt.js';
import { renderFollowupResultMessage, renderFollowupToolUseMessage } from './UI.js';

export const SCHEDULE_FOLLOWUP_TOOL_NAME = 'ScheduleFollowup';

// Shared job ceiling with cron — followups are one-shot cron tasks under the hood.
const MAX_JOBS = 50;
// Bound the delay so a typo can't pin a wakeup years out. 1 min … 7 days.
const MIN_DELAY_MINUTES = 1;
const MAX_DELAY_MINUTES = 7 * 24 * 60;

const inputSchema = lazySchema(() =>
  z.strictObject({
    summary: z
      .string()
      .min(1)
      .describe(
        'One line: what you were working on and are leaving unfinished (e.g. "wiring the retry queue into the worker").',
      ),
    remaining: z
      .string()
      .optional()
      .describe(
        'What is left to do when you come back — the concrete next steps, open questions, or files still to touch. Written to yourself; be specific so future-you can resume without re-deriving context.',
      ),
    delayMinutes: z
      .number()
      .int()
      .min(MIN_DELAY_MINUTES)
      .max(MAX_DELAY_MINUTES)
      .describe(
        `How many minutes from now to come back to this work. ${MIN_DELAY_MINUTES}–${MAX_DELAY_MINUTES} (7 days). The follow-up fires once while the REPL is idle, then auto-deletes.`,
      ),
    durable: semanticBoolean(z.boolean().optional()).describe(
      'true = persist to .clew/scheduled_tasks.json so the follow-up survives a restart (missed ones are surfaced for catch-up on next launch). false (default) = session-only, dies when this session ends.',
    ),
  }),
);
type InputSchema = ReturnType<typeof inputSchema>;

const outputSchema = lazySchema(() =>
  z.object({
    id: z.string(),
    when: z.string(),
    durable: z.boolean(),
  }),
);
type OutputSchema = ReturnType<typeof outputSchema>;
export type FollowupOutput = z.infer<OutputSchema>;

/** Build a one-shot 5-field cron pinned to `target`'s local minute. */
export function oneShotCronFor(target: Date): string {
  return `${target.getMinutes()} ${target.getHours()} ${target.getDate()} ${target.getMonth() + 1} *`;
}

/** Human "in 30m (14:32)" for the tool result — no timezone math, all local. */
export function describeWhen(target: Date, delayMinutes: number): string {
  const hh = String(target.getHours()).padStart(2, '0');
  const mm = String(target.getMinutes()).padStart(2, '0');
  const rel =
    delayMinutes >= 60
      ? `${Math.floor(delayMinutes / 60)}h${delayMinutes % 60 ? `${delayMinutes % 60}m` : ''}`
      : `${delayMinutes}m`;
  return `in ${rel} · at ${hh}:${mm}`;
}

/** The prompt future-you receives when the follow-up fires. */
export function buildFollowupPrompt(summary: string, remaining?: string): string {
  return [
    'Follow-up on unfinished work you scheduled earlier for yourself.',
    '',
    `**What you were doing:** ${summary}`,
    remaining ? `\n**What's left:**\n${remaining}` : '',
    '',
    'Resume from here: re-check the relevant files and state first — things may have changed since you scheduled this. Then continue the work. If it is already done or no longer relevant, say so briefly instead of redoing it.',
  ]
    .filter(line => line !== '')
    .join('\n');
}

export const ScheduleFollowupTool = buildTool({
  name: SCHEDULE_FOLLOWUP_TOOL_NAME,
  searchHint: 'schedule yourself to come back to unfinished work',
  maxResultSizeChars: 100_000,
  shouldDefer: true,
  get inputSchema(): InputSchema {
    return inputSchema();
  },
  get outputSchema(): OutputSchema {
    return outputSchema();
  },
  isEnabled() {
    return isKairosCronEnabled();
  },
  toAutoClassifierInput(input) {
    return `+${input.delayMinutes}m: ${input.summary}`;
  },
  async description() {
    return 'Schedule yourself to come back to work you are leaving unfinished. Records what you were doing and what is left, then re-enqueues that context to yourself after delayMinutes so you can resume. One-shot: fires once while the REPL is idle, then auto-deletes.';
  },
  async prompt() {
    return `Leave yourself a follow-up to resume unfinished work later in this session (or, with durable: true, across restarts).

Use this when you have to stop mid-task and want ${SCHEDULE_FOLLOWUP_TOOL_NAME} to bring you back:
  - waiting on a long build / CI / deploy that the harness will not notify you about
  - a task you have deliberately parked to do something else first
  - "check back on X in a bit" that should not depend on the user re-prompting

Pass a one-line \`summary\`, the concrete \`remaining\` steps (written to future-you — be specific), and \`delayMinutes\` (${MIN_DELAY_MINUTES}–${MAX_DELAY_MINUTES}). It schedules a one-shot wakeup: when it fires you receive your own notes back as a prompt and continue.

By default the follow-up is session-only. Pass durable: true only when it must survive a restart — e.g. the user asked you to pick this up "tomorrow". Missed durable follow-ups are surfaced for catch-up on next launch.

Do not use this to poll for background work the harness already tracks — you are re-invoked automatically when that finishes. Use it for time you must actually wait out, or work you are choosing to defer.`;
  },
  async validateInput(input): Promise<ValidationResult> {
    const tasks = await listAllCronTasks();
    if (tasks.length >= MAX_JOBS) {
      return {
        result: false,
        message: `Too many scheduled jobs (max ${MAX_JOBS}). Cancel one with CronDelete first.`,
        errorCode: 1,
      };
    }
    // Durable teammate crons would orphan on restart (agentId points at a
    // teammate that no longer exists) — same constraint as CronCreate.
    if (input.durable && getTeammateContext()) {
      return {
        result: false,
        message: 'durable follow-ups are not supported for teammates (teammates do not persist across sessions)',
        errorCode: 2,
      };
    }
    return { result: true };
  },
  async call({ summary, remaining, delayMinutes, durable = false }) {
    const target = new Date(Date.now() + delayMinutes * 60_000);
    const cron = oneShotCronFor(target);
    const prompt = buildFollowupPrompt(summary, remaining);
    // Kill switch forces session-only; schema stays stable across a mid-session flip.
    const effectiveDurable = durable && isDurableCronEnabled();
    // Label makes the wakeup banner read "Resuming: <what you were doing>"
    // instead of the generic "Running scheduled task". Truncated so a long
    // summary can't blow out the one-line banner.
    const label = `Resuming: ${summary.length > 72 ? `${summary.slice(0, 71)}…` : summary}`;
    const id = await addCronTask(cron, prompt, false, effectiveDurable, getTeammateContext()?.agentId, label);
    // Start the scheduler tick loop so the one-shot actually fires this session.
    setScheduledTasksEnabled(true);
    return {
      data: { id, when: describeWhen(target, delayMinutes), durable: effectiveDurable },
    };
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    const where = output.durable
      ? 'Persisted to .clew/scheduled_tasks.json (survives restart)'
      : 'Session-only (dies when this session ends)';
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: `Follow-up ${output.id} scheduled ${output.when}. ${where}. It fires once then auto-deletes. Cancel with CronDelete ${output.id}.`,
    };
  },
  renderToolUseMessage: renderFollowupToolUseMessage,
  renderToolResultMessage: renderFollowupResultMessage,
} satisfies ToolDef<InputSchema, FollowupOutput>);
