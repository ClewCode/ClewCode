import type { Command } from '../../commands.js';

export default {
  type: 'local',
  name: 'approve',
  description: 'Override guardian denials (one-time retry)',
  argumentHint: '[<id>|list]',
  supportsNonInteractive: true,
  load: () => import('./approve.js'),
} satisfies Command;
