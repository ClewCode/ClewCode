import type { Command } from '../../types/command.js';

const cd = {
  type: 'local',
  name: 'cd',
  description: 'Move this session to a new working directory',
  argumentHint: '<path>',
  supportsNonInteractive: true,
  load: () => import('./cd.js'),
} satisfies Command;

export default cd;
