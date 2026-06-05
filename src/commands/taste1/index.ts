// Clew taste-1: Command registration — /taste1 and subcommands

import { Taste1Runtime } from '../../services/taste1/core/Taste1Runtime.js';
import type { Command } from '../../types/command.js';

// Lazy singleton runtime (initialized on first use)
let runtime: Taste1Runtime | null = null;

export function getTaste1Runtime(): Taste1Runtime {
  if (!runtime) {
    runtime = new Taste1Runtime();
    // Initialization is async, but we defer it to the command handler
  }
  return runtime;
}

export async function initRuntime(): Promise<Taste1Runtime> {
  const r = getTaste1Runtime();
  if (!r.getProfile().projectId) {
    await r.initialize();
  }
  return r;
}

const taste1: Command = {
  type: 'local-jsx',
  name: 'taste1',
  description: 'Clew taste-1: local-first preference-learning runtime',
  argumentHint: '[status|learn|forget|profile|events|decay|eval|export|import|on|off]',
  isHidden: false,
  load: () => import('./taste1.js'),
};

export default taste1;
