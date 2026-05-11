import type { Command } from '../../commands.js'

const rewind = {
  description: `Restore the code and/or conversation to a previous point`,
  name: 'rewind',
  aliases: ['checkpoint', 'undo'], // /undo is now an alias for /rewind
  argumentHint: '',
  type: 'local',
  supportsNonInteractive: false,
  load: () => import('./rewind.js'),
} satisfies Command

export default rewind
