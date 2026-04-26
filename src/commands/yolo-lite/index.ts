import type { Command } from '../../commands.js'

const yoloLite = {
  type: 'local',
  name: 'yolo-lite',
  description: 'Enable YOLO Lite mode (auto-allow with safety checks)',
  supportsNonInteractive: true,
  load: () => import('./yolo-lite.js'),
} satisfies Command

export default yoloLite
