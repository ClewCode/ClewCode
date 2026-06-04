import type { Command } from '../../commands.js';

export default {
  type: 'local',
  name: 'guardian',
  description: 'Toggle guardian auto-review mode and manage policy',
  argumentHint: '[on|off|status|policy|reset]',
  supportsNonInteractive: true,
  load: () => import('./guardian.js'),
} satisfies Command;
