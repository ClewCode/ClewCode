import type { Command } from '../../commands.js';

const checkup = {
  type: 'prompt',
  name: 'checkup',
  aliases: ['check', 'health'],
  description:
    'Run a system checkup — the agent scans skills, MCP servers, plugins & system health, then cleans up (asks before deleting)',
  argumentHint: '[area]',
  contentLength: 0,
  progressMessage: 'running the Clew Code system checkup',
  source: 'builtin',
  async getPromptForCommand(args: string) {
    const focus = args?.trim()
      ? `\nThe user asked you to focus this checkup on: **${args.trim()}**. Prioritize that area, but still surface anything critical elsewhere.\n`
      : '';
    return [
      {
        type: 'text',
        text: `# Clew Code System Checkup

You are running a **system checkup** of the user's Clew Code environment. Do the work yourself — investigate, diagnose, and clean up. Work through the areas below in order; do NOT use TodoWrite for this (keep the terminal output compact — a redrawing todo panel makes the TUI flicker). Just narrate briefly as you go.
${focus}
## The one hard rule

**Never delete, remove, or overwrite anything without first asking the user to confirm that specific deletion.** Investigating, reading, listing, and reporting are always fine and need no confirmation. But before you run \`rm\`, \`Remove-Item\`, delete a config entry, uninstall a plugin, or otherwise destroy anything, STOP and ask the user with AskUserQuestion — describe exactly what you want to delete and why. Batch related deletions into a single confirmation when it's natural to do so. If the user declines, leave it and move on.

## What to inspect

Go find the real state of things — don't guess. Use Bash/PowerShell, Read, Glob, Grep, and any relevant \`/mcp\`, \`/plugin\`, config files, and clew paths.

1. **Skills** — Scan the project \`.clew/skills/\` and the user skills dir.
   - Flag skill directories that contain no \`SKILL.md\` (empty/broken skills).
   - Flag obviously orphaned or duplicate skills.

2. **MCP servers** — Inspect every configured MCP server across scopes (project \`.mcp.json\`, user, local, enterprise).
   - Report which are enabled vs disabled.
   - Flag disabled servers that look abandoned, and stale \`.mcp.json\` files inherited from parent directories.

3. **Plugins** — List installed plugins and their enabled/disabled state.
   - Flag long-disabled plugins that are candidates for removal.

4. **System health** — Look for the kind of cruft a checkup should catch:
   - Stale / duplicate config files, orphaned temp or log files, broken symlinks.
   - Anything in the repo working tree that looks like accidental junk (but treat genuine work-in-progress changes as intentional — do not touch them).

## How to report and act

- Group findings by area with a clear severity (error / warning / info) and a one-line description each.
- **Auto-apply** safe, non-destructive fixes on your own (e.g. re-enabling something the user clearly wants, correcting a malformed config, creating a missing directory) — mention what you did.
- For every **destructive** cleanup (deletions, uninstalls, removing config entries), collect them and ask the user to confirm before doing anything, per the hard rule above.
- End with a short summary: N checks, X issues, what you fixed, what needs the user's decision.

Begin now.`,
      },
    ];
  },
} satisfies Command;

export default checkup;
