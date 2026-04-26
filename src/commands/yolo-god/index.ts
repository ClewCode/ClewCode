import type { Command } from '../../commands.js'

const yoloGod = {
  type: 'local',
  name: 'yolo-god',
  description: 'Enable YOLO God mode (maximum power - no limits)',
  supportsNonInteractive: true,
  load: () => import('./yolo-god.js'),
} satisfies Command

export default yoloGod
