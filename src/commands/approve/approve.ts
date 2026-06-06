/**
 * `/approve` slash command — override guardian denials.
 *
 * Lists recent denials from the guardian auto-reviewer.
 * Each denial can be overridden once, allowing a retry.
 *
 * Subcommands:
 *   (no args)    List recent denials
 *   <id>         Override a specific denial
 *   list         Alias for listing denials
 */

import type { LocalCommandResult, LocalJSXCommandContext } from '../../types/command.js';
import { clearDenials, listRecentDenials, markOverridden } from '../../utils/permissions/guardianDenialStore.js';

export async function call(args: string, _context: LocalJSXCommandContext): Promise<LocalCommandResult> {
  const trimmed = args.trim();
  const [verb] = trimmed.split(/\s+/);

  if (!verb || verb === 'list') {
    const denials = listRecentDenials();
    if (denials.length === 0) {
      return { type: 'text', value: '◈ approve · no recent denials.' };
    }
    const lines = ['◈ approve · recent denials:'];
    for (const d of denials) {
      const status = d.overridden ? '✓ overridden' : '○ pending';
      const tool = d.toolName.padEnd(12);
      lines.push(`  ${d.id.slice(0, 8)}  ${tool}  ${d.reason.slice(0, 60)}  ${status}`);
    }
    lines.push('', 'Override with: /approve <id>');
    return { type: 'text', value: lines.join('\n') };
  }

  if (verb === '--clear' || verb === 'clear') {
    clearDenials();
    return { type: 'text', value: '◈ approve · denials cleared.' };
  }

  // Treat as ID — override
  const record = markOverridden(verb);
  if (!record) {
    return { type: 'text', value: `◈ approve · denial not found: ${verb}\n  Use /approve to list recent denials.` };
  }

  return {
    type: 'text',
    value:
      `◈ approve · denial overridden: ${verb}\n` +
      `  Tool: ${record.toolName}\n` +
      `  Input: ${record.toolInput.slice(0, 100)}\n` +
      `  Reason: ${record.reason}\n` +
      '\n' +
      'The action has been approved for one retry.',
  };
}
