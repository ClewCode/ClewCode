import type { Command } from '../../commands.js';

export default {
  type: 'local-jsx',
  name: 'delegate',
  description:
    'Run one subagent synchronously and show its result — by default the rlm recursive orchestrator; pass an agent type as the first token to delegate to that agent instead',
  argumentHint: '[agent-type] prompt',
  load: () => import('./delegate.js'),
} satisfies Command;
