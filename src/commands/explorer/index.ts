import type { Command } from '../../commands.js'

const explorer: Command = {
  type: 'local',
  name: 'explorer',
  description: 'Toggle file explorer sidebar',
  supportsNonInteractive: true,
  load: () => import('./explorer.js'),
}

export default explorer
