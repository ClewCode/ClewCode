// Clew taste: Command registration — /taste and subcommands
// The runtime singleton lives in TasteIntegration; we just re-export it.

import type { TasteRuntime } from '../../services/taste/core/TasteRuntime.js';
import { getTasteRuntime } from '../../services/taste/TasteIntegration.js';
import type { Command } from '../../types/command.js';

export { getTasteRuntime };

/** Ensure the runtime profile is initialized. Safe to call repeatedly. */
export async function initRuntime(): Promise<TasteRuntime> {
  const r = getTasteRuntime();
  if (!r.getProfile().projectId) {
    await r.initialize();
  }
  return r;
}

const taste: Command = {
  type: 'local-jsx',
  name: 'taste',
  description: 'Clew taste: local-first preference-learning runtime',
  argumentHint: '[status|learn|forget|profile|events|decay|eval|export|import|on|off]',
  isHidden: false,
  load: () => import('./taste.js'),
};

export default taste;
