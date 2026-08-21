import type { Command } from '../../commands.js';

export default {
  type: 'local-jsx',
  name: 'delegate',
  description:
    'Run one subagent synchronously and show its result; pass an agent type as the first token to delegate to that agent (e.g. /delegate Explore ...)',
  argumentHint: '[agent-type] prompt',
  load: () => import('./delegate.js'),
} satisfies Command;
