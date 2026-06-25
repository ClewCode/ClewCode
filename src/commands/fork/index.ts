import type { Command } from '../../commands.js';

const fork: Command = {
  type: 'local-jsx',
  name: 'fork',
  description: 'Fork the current conversation into a new session',
  argumentHint: '[name]',
  load: () => import('./fork.js'),
};

export default fork;
