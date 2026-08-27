/**
 * /code-search — Cursor-style hybrid semantic + keyword search over the codebase.
 * Command registration only — implementation lives in handler.ts.
 */

import type { Command } from '../../types/command.js';

export const codeSearch: Command = {
  name: 'code-search',
  description: 'Hybrid semantic + keyword (BM25) search over codebase chunks',
  type: 'local',
  supportsNonInteractive: true,
  argumentHint: '<query> | stats | refresh',
  load: () => import('./handler.js'),
};
