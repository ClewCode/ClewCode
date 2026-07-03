import type { Command } from '../../types/command.js';
import { loadProjectRules, formatRulesNotification } from '../../utils/projectRules.js';

const rule: Command = {
  type: 'local',
  name: 'rule',
  description: 'Show project-specific behavioral rules',
  supportsNonInteractive: true,
  async load() {
    return {
      async call() {
        const rules = await loadProjectRules();
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
