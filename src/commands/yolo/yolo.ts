import { permissionModeTitle, permissionModeSymbol } from '../../utils/permissions/PermissionMode.js'
import { formatYoloStats } from '../../utils/permissions/denialTracking.js'
import type { LocalCommandCall } from '../../types/command.js'

const YOLO_TIERS = [
  { mode: 'yoloLite', description: 'Auto-allow file ops, safety checks for dangerous commands' },
  { mode: 'yolo', description: 'Auto-allow everything (equivalent to bypassPermissions)' },
  { mode: 'yoloMax', description: 'Auto-allow + bypass sandbox' },
  { mode: 'yoloGod', description: 'Maximum power - no limits' },
]

export const call: LocalCommandCall = async () => {
  // Show available tiers
  return {
    type: 'text',
    value: `Available YOLO tiers:\n` +
      YOLO_TIERS.map(tier => 
        `  ${permissionModeSymbol(tier.mode as any)} ${permissionModeTitle(tier.mode as any)} - ${tier.description}`
      ).join('\n') +
      `\n\nUsage: /yolo stats\nUse /permissions <tier> to switch modes`,
  }
}
