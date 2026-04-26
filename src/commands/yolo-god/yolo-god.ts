import type { LocalCommandCall } from '../../types/command.js'

export const call: LocalCommandCall = async () => {
  return {
    type: 'text',
    value: `To enable YOLO God mode, use: /permissions yoloGod\n\nYOLO God: Maximum power - no limits (🔥)`,
  }
}
