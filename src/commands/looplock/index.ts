import type { Command } from '../../types/command.js';

const looplock: Command = {
  type: 'local-jsx',
  name: 'looplock',
  aliases: ['loop-lock'],
  description: 'Enable and start the 24/7 autonomous agent loop',
  isEnabled: () => true,
  load: () => import('./looplock.js'),
};

export default looplock;
