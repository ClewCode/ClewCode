import type { Command } from '../../commands.js';
import { shouldInferenceConfigCommandBeImmediate } from '../../utils/immediateCommand.js';
import { getMainLoopModel, renderModelName } from '../../utils/model/model.js';

function getProviderLabel(): string {
  try {
    const { ProviderManager } =
      require('../../services/ai/ProviderManager.js') as typeof import('../../services/ai/ProviderManager.js');
    const { getProviderRegistryEntry } =
      require('../../services/ai/providerRegistry.js') as typeof import('../../services/ai/providerRegistry.js');
    const providerId = ProviderManager.getInstance().getActiveProviderName();
    const entry = getProviderRegistryEntry(providerId);
    return entry?.label ?? 'Clew Code';
  } catch {
    return 'Clew Code';
  }
}

export default {
  type: 'local-jsx',
  name: 'model',
  get description() {
    return `Set the AI model for ${getProviderLabel()} (currently ${renderModelName(getMainLoopModel())})`;
  },
  argumentHint: '[model]',
  get immediate() {
    return shouldInferenceConfigCommandBeImmediate();
  },
  load: () => import('./model.js'),
} satisfies Command;
