import type { Command } from '../../commands.js';
import { shouldInferenceConfigCommandBeImmediate } from '../../utils/immediateCommand.js';

export default {
  type: 'local-jsx',
  name: 'peer',
  aliases: ['peer'],
  description: 'Run tasks on other Clew machines on your LAN (not subagents)',
  argumentHint: '[share|discover|list|todo|todos|swarm|dashboard|memory sync|memory auto]',
  get immediate() {
    return shouldInferenceConfigCommandBeImmediate();
  },
  load: () => import('./peer.js'),
} satisfies Command;
