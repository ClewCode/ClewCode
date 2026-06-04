import type { Command } from '../../commands.js';

const autofixPr: Command = {
  type: 'local-jsx',
  name: 'autofix-pr',
  aliases: [],
  description: 'Fix CI errors and address review comments on a PR using Clew Code on the web',
  argumentHint: '[pr-number] <prompt>',
  isHidden: false,
  load: () => import('./autofixPr.js'),
};

export default autofixPr;
