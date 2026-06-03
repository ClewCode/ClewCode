import type { Command } from '../../commands.js';

export default {
  type: 'local',
  name: 'workflow',
  description: 'List, resume, or cancel persisted dynamic workflow runs',
  argumentHint: '[list|show <id>|resume <id>|cancel <id>]',
  supportsNonInteractive: true,
  load: () => import('./workflow.js'),
} satisfies Command;
