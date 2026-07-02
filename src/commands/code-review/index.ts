import type { Command } from '../../commands.js';

export default {
  type: 'local-jsx',
  name: 'code-review',
  description:
    'Workflow-backed code review with scoped finder agents, independent verification, cleanup sweep, and synthesis',
  argumentHint: '[low|medium|high] [--fix] [--comment]',
  kind: 'workflow',
  load: () => import('./codeReview.js'),
} satisfies Command;
