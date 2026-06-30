import type { Command } from '../../commands.js';

const autofixPr: Command = {
  type: 'local-jsx',
  name: 'autofix-pr',
  aliases: [],
  description: 'Monitor and autofix issues with the current PR (cloud if available, else locally in this session)',
  argumentHint: '[pr-number] [--local|--remote] [prompt]',
  isHidden: false,
  load: () => import('./autofixPr.js'),
};

export default autofixPr;
