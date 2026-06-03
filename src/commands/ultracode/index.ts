import type { Command } from '../../commands.js';

export default {
  type: 'local',
  name: 'ultracode',
  description: 'Toggle ultracode mode (xhigh effort + dynamic workflows)',
  argumentHint: '[on|off|status|confirm|reset|run <prompt>]',
  supportsNonInteractive: true,
  load: () => import('./ultracode.js'),
} satisfies Command;
