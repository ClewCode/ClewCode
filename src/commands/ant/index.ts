import type { Command } from '../../commands.js';

const ant = {
  type: 'local-jsx',
  name: 'ant',
  description: 'Toggle ant-only beta features',
  argumentHint: '[on|off|<name> on|off]',
  load: () => import('./ant.js'),
} satisfies Command;

export default ant;
