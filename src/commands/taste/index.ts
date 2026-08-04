import type { Command } from '../../commands.js';

const taste = {
  type: 'local-jsx',
  name: 'taste',
  description: 'View and manage learned preferences (TASTE.md)',
  argumentHint: '[on|off|forget N]',
  load: () => import('./taste.js'),
} satisfies Command;

export default taste;
