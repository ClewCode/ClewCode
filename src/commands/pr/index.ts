import type { Command } from '../../commands.js';

export default {
  type: 'local',
  name: 'pr',
  description: 'Manage GitHub pull requests (create, list, review, merge)',
  argumentHint: 'create|list|view|review|merge|status [options]',
  supportsNonInteractive: true,
  load: () => import('./pr.js'),
} satisfies Command;
