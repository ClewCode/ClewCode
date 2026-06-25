import type { Command } from '../../commands.js';

const branch: Command = {
  type: 'local-jsx',
  name: 'branch',
  description: 'Create a branch of the current conversation at this point',
  argumentHint: '[name]',
  load: () => import('./branch.js'),
};

export default branch;
