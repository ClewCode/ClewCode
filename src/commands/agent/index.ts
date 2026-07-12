import type { Command } from '../../commands.js';

const agentCmd: Command = {
  type: 'local-jsx',
  name: 'agents',
  description: 'AI Agents: dispatch from chat, monitor sessions, manage definitions, and control the agent runtime',
  isEnabled: () => true,
  argumentHint: '<task|view|config|run|status|trace> [args]',
  load: () => import('./agent.js'),
};

export default agentCmd;
