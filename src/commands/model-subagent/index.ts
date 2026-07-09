import type { Command } from '../../commands.js';

const modelSubagent: Command = {
  type: 'local-jsx',
  name: 'modelsubagent',
  aliases: ['modelagent'],
  description: 'Set the default model for Agent subagents',
  argumentHint: '[model|provider/model|default]',
  load: () => import('./model-subagent.js'),
} satisfies Command;

export default modelSubagent;
