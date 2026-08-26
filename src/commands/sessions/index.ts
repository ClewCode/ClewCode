import type { Command } from '../../commands.js';

const sessions: Command = {
  type: 'local-jsx',
  name: 'sessions',
  description: 'Browse every session — running, idle, and archived — and drill into their subagents',
  aliases: ['catalog'],
  argumentHint: '[--all]',
  inline: true,
  isEnabled: () => true,
  load: () => import('./sessions.js'),
};

export default sessions;
