import type { Command } from '../../commands.js';

export default {
  type: 'local-jsx',
  name: 'mode',
  description: 'Switch behavioral mode (roleplay, socratic, reviewer, …) or define your own',
  argumentHint: '[name|off|list]',
  load: () => import('./mode.js'),
} satisfies Command;
