import type { LocalCommandCall } from '../../types/command.js'

export const call: LocalCommandCall = async () => {
  return {
    type: 'text',
    value: `To enable YOLO Lite mode, use: /permissions yoloLite\n\nYOLO Lite: Auto-allow file operations with safety checks for dangerous commands (⚡)`,
  }
}
