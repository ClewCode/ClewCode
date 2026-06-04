import type { Command } from '../../commands.js';

const agentCmd: Command = {
  type: 'local-jsx',
  name: 'agent',
  description: 'Manage Clew Code AI Agents execution, state checkpoints, and approvals',
  isEnabled: () => true,
  argumentHint: '<run|status|trace|pause|resume|approvals|approve|deny|report|doctor> [args]',
  load: () => import('./agent.js'),
};

export default agentCmd;
