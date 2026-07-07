import type { Command } from '../../types/command.js';
import {
  loadProjectRules,
  formatRulesNotification,
  isProjectRulesDisabled,
  setProjectRulesDisabled,
  saveProjectRule,
  removeProjectRule,
  editProjectRule,
} from '../../utils/projectRules.js';

function formatRulesList(rules: string[], disabled: boolean): string {
  const status = disabled ? 'Project Rules — Disabled' : `Project Rules — Active (${rules.length} rule${rules.length !== 1 ? 's' : ''})`;
  const lines = [status, ''];

  if (rules.length === 0) {
    lines.push(disabled ? '(use /rule on to re-enable)' : 'No rules saved yet.');
  } else {
    for (let i = 0; i < rules.length; i++) {
      lines.push(`  ${i + 1}. ${rules[i]}`);
    }
  }

  lines.push('');
  lines.push(disabled
    ? 'Use /rule on to re-enable.'
    : 'Use /rule add | remove | edit to manage.'
  );
  return lines.join('\n');
}

const rule: Command = {
  type: 'local',
  name: 'rule',
  description: 'Manage project rules. Subcommands: add, remove, edit, on, off (default: list).',
  supportsNonInteractive: true,
  async load() {
    return {
      async call(args: string) {
        const trimmed = args.trim();

        if (!trimmed || trimmed === 'on' || trimmed === 'off') {
          // toggle or default list
          if (trimmed === 'off') {
            await setProjectRulesDisabled(true);
          } else if (trimmed === 'on') {
            await setProjectRulesDisabled(false);
          }
          const [rules, disabled] = await Promise.all([loadProjectRules(), isProjectRulesDisabled()]);
          return { type: 'text' as const, value: formatRulesList(rules, disabled) };
        }

        const parts = trimmed.split(/\s+/);
        const subcommand = parts[0].toLowerCase();

        switch (subcommand) {
          case 'add': {
            const text = parts.slice(1).join(' ').trim();
            if (!text) {
              return { type: 'text' as const, value: 'Usage: /rule add <rule text>' };
            }
            await saveProjectRule(text);
            const rules = await loadProjectRules();
            return { type: 'text' as const, value: formatRulesList(rules, await isProjectRulesDisabled()) };
          }

          case 'remove':
          case 'rm': {
            const idx = parseInt(parts[1], 10);
            if (isNaN(idx) || idx < 1) {
              return { type: 'text' as const, value: 'Usage: /rule remove <index>  (1-based)' };
            }
            const removed = await removeProjectRule(idx - 1);
            if (removed === null) {
              return { type: 'text' as const, value: `No rule found at index ${idx}.` };
            }
            const rulesAfterRemove = await loadProjectRules();
            const disabledAfterRemove = await isProjectRulesDisabled();
            return { type: 'text' as const, value: `Removed rule ${idx}: "${removed}"\n\n${formatRulesList(rulesAfterRemove, disabledAfterRemove)}` };
          }

          case 'edit': {
            const idx = parseInt(parts[1], 10);
            if (isNaN(idx) || idx < 1) {
              return { type: 'text' as const, value: 'Usage: /rule edit <index> <new text>' };
            }
            const newText = parts.slice(2).join(' ').trim();
            if (!newText) {
              return { type: 'text' as const, value: 'Usage: /rule edit <index> <new text>' };
            }
            const old = await editProjectRule(idx - 1, newText);
            if (old === null) {
              return { type: 'text' as const, value: `No rule found at index ${idx}.` };
            }
            const rulesAfterEdit = await loadProjectRules();
            const disabledAfterEdit = await isProjectRulesDisabled();
            return { type: 'text' as const, value: `Edited rule ${idx}:\n  Old: "${old}"\n  New: "${newText}"\n\n${formatRulesList(rulesAfterEdit, disabledAfterEdit)}` };
          }

          default:
            return { type: 'text' as const, value: `Unknown subcommand "${subcommand}".\n\nUsage: /rule [add | remove | edit | on | off]` };
        }
      },
    };
  },
};

export default rule;
