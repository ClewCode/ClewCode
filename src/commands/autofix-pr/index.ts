import type { Command } from '../../commands.js';

const autofixPr: Command = {
  type: 'local-jsx',
  name: 'autofix-pr',
  aliases: [],
  description: 'Monitor and autofix any issues with the current PR',
  argumentHint: '[pr-number] [prompt]',
  isHidden: false,
  load: () => import('./autofixPr.js'),
};

export default autofixPr;
