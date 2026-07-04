import type { Command } from '../../commands.js';

const workspace = {
  type: 'local-jsx',
  name: 'workspace',
  description: 'Link projects together so their directories load automatically',
  argumentHint: '[link <path> | unlink <path> | load | list]',
  load: () => import('./workspace.js'),
} satisfies Command;

export default workspace;
