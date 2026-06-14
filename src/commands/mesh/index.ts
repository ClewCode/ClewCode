import type { Command } from '../../commands.js';
import { shouldInferenceConfigCommandBeImmediate } from '../../utils/immediateCommand.js';

export default {
  type: 'local-jsx',
  name: 'mesh',
  aliases: ['peer'],
  description: 'Mesh: Collaborate with other Clew instances on LAN and assign tasks',
  argumentHint: '[share|discover|list|todo|todos]',
  get immediate() {
    return shouldInferenceConfigCommandBeImmediate();
  },
  load: () => import('./mesh.js'),
} satisfies Command;
