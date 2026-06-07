import type { Command } from '../../commands.js';
import { shouldInferenceConfigCommandBeImmediate } from '../../utils/immediateCommand.js';

export default {
  type: 'local-jsx',
  name: 'peer',
  description: 'Discover workers on LAN and assign tasks',
  argumentHint: '[share|discover|list|todo|todos]',
  get immediate() {
    return shouldInferenceConfigCommandBeImmediate();
  },
  load: () => import('./peer.js'),
} satisfies Command;
