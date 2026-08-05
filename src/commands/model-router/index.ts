import type { Command } from '../../types/command.js';

const modelRouter = {
  type: 'local',
  name: 'model-router',
  aliases: ['router'],
  description: 'Route different task modes (code, ask, debug, orchestrator, plan) to different models',
  argumentHint: '[set <mode> <provider|-> <model> [effort] | unset <mode>]',
  supportsNonInteractive: true,
  load: () => import('./model-router.js'),
} satisfies Command;

export default modelRouter;
