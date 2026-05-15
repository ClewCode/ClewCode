import type { Command } from '../../commands.js'

const memory: Command = {
  type: 'local-jsx',
  name: 'memory',
  description: 'Edit Claude memory files',
  load: () => import('./memory.js'),
}

export const memorySearch: Command = {
  type: 'local-jsx',
  name: 'memory-search',
  description: 'Search memories using semantic search (cross-lingual)',
  load: () => import('./memorySearch.js'),
}

export default memory
