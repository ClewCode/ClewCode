import type { Command } from '../../commands.js';

const voice = {
  type: 'local',
  name: 'voice',
  description: 'Capture speech via browser microphone and return as text. /voice to start, Esc to stop',
  argumentHint: '[start|stop]',
  supportsNonInteractive: false,
  load: () => import('./voice.js'),
} satisfies Command;

export default voice;
