import type { Command } from '../../commands.js'

const yoloMax = {
  type: 'local',
  name: 'yolo-max',
  description: 'Enable YOLO Max mode (auto-allow + bypass sandbox)',
  supportsNonInteractive: true,
  load: () => import('./yolo-max.js'),
} satisfies Command

export default yoloMax
