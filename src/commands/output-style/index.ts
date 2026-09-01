import type { Command } from '../../commands.js';

const outputStyle = {
  type: 'local-jsx',
  name: 'output-style',
  description: 'Set your preferred output style (e.g. default, concise, explanatory, learning, proactive)',
  aliases: ['outputstyle', 'style'],
  load: () => import('./output-style.js'),
} satisfies Command;

export default outputStyle;
