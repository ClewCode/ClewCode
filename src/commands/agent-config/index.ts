import type { Command } from '../../commands.js';

const agentConfig: Command = {
  type: 'local-jsx',
  name: 'agent-config',
  aliases: ['modelagent'],
  description: 'Configure default model, provider, and permission mode for Agent subagents',
  argumentHint: '[show|model <model>|provider <provider>|permission <mode>|all|default]',
  load: () => import('./agent-config.js'),
} satisfies Command;

export default agentConfig;
