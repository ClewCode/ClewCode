import { registerBundledSkill } from '../bundledSkills.js';

const USAGE = `/loopmd — Self-verifying auto loops via LOOP.md

A LOOP.md file defines an autonomous loop with goal, verification,
and guardrails — the agent runs it until DONE-WHEN conditions pass.

Usage:
  /loopmd run [path]      Run the loop defined in LOOP.md (default: ./LOOP.md)
  /loopmd create <desc>   Generate a LOOP.md for a task description
  /loopmd status          Show current loop state from PROGRESS.md

Examples:
  /loopmd run
  /loopmd create fix all lint errors and add missing types
  /loopmd run ./tasks/refactor-api.md

See also: /goal (set completion criteria), /loop (time-based polling)`;

function buildRunPrompt(args: string): string {
  const loopPath = args || './LOOP.md';
  return `# /loopmd run — Execute a LOOP.md autonomous loop

You are executing an autonomous loop defined in **${loopPath}**.

## Protocol

1. **Read ${loopPath}** — parse the Goal, DONE-WHEN, TEST-AS-YOU-GO, and GUARDRAILS sections.
2. **Read PROGRESS.md** (if exists) — resume from where the loop left off.
3. **Execute one iteration** — follow the loop instructions, respecting GUARDRAILS.
4. **Run TEST-AS-YOU-GO** checks after each change.
5. **Check DONE-WHEN** — if ALL conditions pass, skip to step 7.
6. **Update PROGRESS.md** — log what was done, what's left, current iteration count. Then go to step 3.
7. **Summarize** — what was accomplished, what passed/failed, any issues.
8. **Clean up PROGRESS.md** — mark the loop as complete with a timestamp.

## LOOP.md format reference

\`\`\`markdown
# Loop: <title>

## Goal
<what done looks like>

## DONE WHEN (verification — machine-checkable proof of "done")
- [ ] <command or condition>
- [ ] <another check>

## TEST AS YOU GO (per-iteration checks)
- <check to run after each change>

## GUARDRAILS
- <boundaries — what NOT to modify, when to ask>
\`\`\`

## Rules

- Never skip, weaken, or delete a test to make DONE-WHEN pass faster.
- If stuck after 3 iterations, stop and explain what's blocking.
- Update PROGRESS.md after every iteration with: iteration number, what changed, next step.
- If LOOP.md doesn't exist yet, offer to create one with /loopmd create.

## Input

${args || '(no path specified — default: ./LOOP.md)'}`;
}

function buildCreatePrompt(args: string): string {
  return `# /loopmd create — Generate a LOOP.md

The user wants a LOOP.md for: ${args || '(no description — ask what task they want to loop on)'}

## Your task

If no description was given, ask a few targeted questions to understand:
1. What is the goal? (what does "done" look like)
2. What verification criteria can be checked with a command?
3. What are the boundaries? (files to avoid, permissions needed)
4. What cheap checks should run after each change?

If a description was given, work with what you have — ask only for missing details.

Then generate a LOOP.md with these sections:

\`\`\`markdown
# Loop: <title>

## Goal
<concise statement of what done looks like>

## DONE WHEN (verification)
- [ ] <machine-checkable condition> — each must be a real command or verifiable check
- [ ] <another check>

## TEST AS YOU GO (inner loop — run after every change)
- <cheap check>

## GUARDRAILS
- <boundaries>
\`\`\`

Save it to ./LOOP.md and suggest running it with: /loopmd run`;
}

function buildStatusPrompt(): string {
  return `# /loopmd status — Show current loop state

Read ./PROGRESS.md if it exists and summarize:
- Current iteration
- What's been done
- What's remaining
- Are we blocked?
- Are DONE-WHEN conditions met?

If PROGRESS.md doesn't exist, say the loop hasn't started yet.`;
}

export function registerLoopMdSkill(): void {
  registerBundledSkill({
    name: 'loopmd',
    aliases: ['loopfile', 'loops'],
    description: 'Design and run self-verifying autonomous loops via LOOP.md (goal/verification/guardrails)',
    whenToUse:
      'When the user wants to design an autonomous loop for a complex task, run a LOOP.md file, or check loop status. Use for multi-step tasks that need self-verification and iteration — NOT for simple one-shot requests.',
    argumentHint: 'run [path] | create <description> | status',
    userInvocable: true,
    isEnabled: () => true,
    async getPromptForCommand(args) {
      const trimmed = args?.trim() || '';
      const parts = trimmed.split(/\s+/);
      const cmd = parts[0]?.toLowerCase();

      if (cmd === 'run') {
        const path = parts.slice(1).join(' ');
        return [{ type: 'text', text: buildRunPrompt(path) }];
      }

      if (cmd === 'create') {
        const desc = parts.slice(1).join(' ').trim();
        return [{ type: 'text', text: buildCreatePrompt(desc) }];
      }

      if (cmd === 'status') {
        return [{ type: 'text', text: buildStatusPrompt() }];
      }

      return [{ type: 'text', text: USAGE }];
    },
  });
}
