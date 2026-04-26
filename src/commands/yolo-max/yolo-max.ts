import type { LocalCommandCall } from '../../types/command.js'

export const call: LocalCommandCall = async () => {
  return {
    type: 'text',
    value: `To enable YOLO Max mode, use: /permissions yoloMax\n\nYOLO Max: Auto-allow everything + bypass sandbox (⚡⚡)`,
  }
}
