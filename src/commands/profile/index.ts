import type { Command } from '../../commands.js';

const profile: Command = {
  type: 'local-jsx',
  name: 'profile',
  description: 'Switch between coding and personal profiles',
  argumentHint: '[coding|personal]',
  load: () => import('./profile.js'),
};

export default profile;
