import type { Command } from '../../commands.js';
import { getMaxModeConfig } from '../../services/maxMode/candidateRunner.js';

const maxMode = {
  type: 'local-jsx',
  name: 'maxmode',
  get description() {
    const config = getMaxModeConfig();
    const status = config.enabled ? 'ON' : 'OFF';
    return `Toggle max mode (parallel candidates) — currently ${status}`;
  },
  availability: ['claude-ai', 'console'],
  isEnabled: () => true,
  argumentHint: '[on|off|candidates N]',
  load: () => import('./maxMode.js'),
} satisfies Command;

export default maxMode;
