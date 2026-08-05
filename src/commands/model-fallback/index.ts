import type { Command } from '../../types/command.js';

const modelFallback = {
  type: 'local',
  name: 'model-fallback',
  aliases: ['fallback'],
  description: 'Configure the ordered model fallback chain used on capacity errors',
  argumentHint: '[add <provider|-> <model> [effort] | remove <n> | move <from> <to> | clear]',
  supportsNonInteractive: true,
  load: () => import('./model-fallback.js'),
} satisfies Command;

export default modelFallback;
