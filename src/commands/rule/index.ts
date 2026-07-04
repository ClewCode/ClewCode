import type { Command } from '../../types/command.js';
import {
  loadProjectRules,
  formatRulesNotification,
  isProjectRulesDisabled,
  setProjectRulesDisabled,
} from '../../utils/projectRules.js';

const rule: Command = {
  type: 'local',
  name: 'rule',
  description: 'Show project-specific behavioral rules. /rule off to disable.',
  supportsNonInteractive: true,
  async load() {
    return {
      async call(args: string) {
        const trimmed = args.trim();

        if (trimmed === 'off') {
          await setProjectRulesDisabled(true);
          return {
            type: 'text' as const,
            value: 'Project rules disabled. Rules are still saved but will not be injected into the prompt or shown at startup. Use /rule to re-enable.',
          };
        }

        if (trimmed === 'on') {
          await setProjectRulesDisabled(false);
          const rules = await loadProjectRules();
          if (rules.length === 0) {
            return {
              type: 'text' as const,
              value: 'Project rules enabled. No rules saved yet. Rules are auto-observed from your behavior and saved by the model.',
            };
          }
          return {
            type: 'text' as const,
            value: `Project rules enabled (${rules.length}):\n${formatRulesNotification(rules)}`,
          };
        }

        const disabled = await isProjectRulesDisabled();
        const rules = await loadProjectRules();

        if (disabled) {
          return {
            type: 'text' as const,
            value: 'Project rules are currently disabled. Use /rule on to re-enable.',
          };
        }

        if (rules.length === 0) {
          return {
            type: 'text' as const,
            value: 'No project rules saved yet. Rules are auto-observed from your behavior and saved by the model.',
          };
        }

        return {
          type: 'text' as const,
          value: formatRulesNotification(rules),
        };
      },
    };
  },
};

export default rule;
