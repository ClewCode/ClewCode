import type { Command } from '../../commands.js';
import { shouldInferenceConfigCommandBeImmediate } from '../../utils/immediateCommand.js';

export default {
  type: 'local-jsx',
  name: 'fast',
  description: 'Toggle Fast Mode for all providers',
  get immediate() {
    return shouldInferenceConfigCommandBeImmediate();
  },
  load: () => import('./fast.js'),
} satisfies Command;
