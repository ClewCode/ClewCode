export const SCHEDULE_TOOL_NAME = 'Schedule';

export const DESCRIPTION =
  'Schedule work for later: a recurring cron job, a one-shot run at a specific time, or a follow-up that brings you ' +
  'back to unfinished work after a delay. Also lists and deletes what is scheduled.';

export const PROMPT = `One tool for everything time-based. Pick an \`action\`:

  followup — come back to work you are leaving unfinished. Pass \`summary\` (one line on what you were doing),
             \`remaining\` (the concrete next steps, written to future-you), and \`delayMinutes\`.
             When it fires you receive your own notes back as a prompt. This is the one you usually want.

  create   — schedule a \`prompt\` on a \`cron\` expression (5 fields, local time: "M H DoM Mon DoW").
             \`recurring: false\` fires once at the next match then deletes itself — use that for
             "remind me at 3pm", with the minute/hour/day/month pinned.

  list     — everything currently scheduled, with its next fire time.
  delete   — remove one job by \`id\`.

\`durable: true\` persists to .clew/scheduled_tasks.json so the job survives a restart; the default is session-only.
Use durable only when the work genuinely spans sessions (the user said "tomorrow"), because a durable job that is no
longer relevant still fires.

Prefer \`followup\` over \`create\` for "check back on this later": it carries your own context forward, where a bare
cron prompt makes future-you re-derive it.`;
