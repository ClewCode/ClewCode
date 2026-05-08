import type { Command } from '../../commands.js'

const powerup = {
  type: 'local-jsx',
  name: 'powerup',
  description: 'Interactive lessons teaching Claude Code features with animated demos',
  load: () => import('./powerup.js'),
} satisfies Command

export default powerup