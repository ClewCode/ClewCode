import type { Command } from '../../commands.js';

const memory: Command = {
  type: 'local-jsx',
  name: 'memory',
  description: 'Edit Clew memory files',
  load: () => import('./memory.js'),
};

export const memorySearch: Command = {
  type: 'local-jsx',
  name: 'memory-search',
  description: 'Search memories using semantic search (cross-lingual)',
  load: () => import('./memorySearch.js'),
};

export const indexAdmin: Command = {
  type: 'local-jsx',
  name: 'index-admin',
  description: 'Manage semantic vector index (stats, prune, clear)',
  load: () => import('./indexAdmin.js'),
};

export default memory;
