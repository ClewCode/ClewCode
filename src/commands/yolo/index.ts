import type { Command } from '../../commands.js'

const yolo = {
  type: 'local',
  name: 'yolo',
  description: 'Manage YOLO mode tiers and view stats',
  supportsNonInteractive: true,
  load: () => import('./yolo.js'),
} satisfies Command

export default yolo
