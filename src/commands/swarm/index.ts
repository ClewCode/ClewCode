import type { Command } from '../../commands.js';
import { shouldInferenceConfigCommandBeImmediate } from '../../utils/immediateCommand.js';

export default {
  type: 'local-jsx',
  name: 'swarm',
  aliases: ['peer'],
  description: 'Swarm: Collaborate with other Clew instances on LAN and assign tasks',
  argumentHint: '[share|discover|list|todo|todos]',
  get immediate() {
    return shouldInferenceConfigCommandBeImmediate();
  },
  load: () => import('./swarm.js'),
} satisfies Command;
