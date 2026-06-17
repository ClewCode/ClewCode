import type { Command } from '../../commands.js';

const tools: Command = {
  type: 'local-jsx',
  name: 'tools',
  aliases: ['tool-list', 'tool-usage'],
  description: 'List all tools with usage stats and estimated token cost',
  load: () => import('./tools.js'),
};

export default tools;
