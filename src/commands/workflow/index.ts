import type { Command } from '../../commands.js';

export default {
  type: 'local-jsx',
  name: 'workflow',
  description: 'Interactive catalog to inspect, resume, or cancel dynamic workflow runs',
  argumentHint: '[show <id>|resume <id>|cancel <id>]',
  supportsNonInteractive: true,
  load: () => import('./workflow.js'),
} satisfies Command;
