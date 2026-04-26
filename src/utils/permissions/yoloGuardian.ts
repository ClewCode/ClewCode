/**
 * YOLO Guardian - Safety checks for YOLO Lite mode
 * 
 * Provides intelligent safety checks for YOLO Lite mode:
 * - Detects dangerous commands (rm -rf, drop database, etc.)
 * - Auto-backup before editing sensitive files
 * - One-time confirmation for critical operations
 */

import type { Tool } from '../../Tool.js'
import { BASH_TOOL_NAME } from '../../tools/BashTool/toolName.js'
import { POWERSHELL_TOOL_NAME } from '../../tools/PowerShellTool/toolName.js'
import { logForDebugging } from '../debug.js'

// Dangerous command patterns that should trigger warnings
const DANGEROUS_BASH_PATTERNS = [
  /rm\s+-rf\s+\//,           // rm -rf /
  /rm\s+-rf\s+\.\./,         // rm -rf ../
  /rm\s+-rf\s+~\//,          // rm -rf ~/
  /dd\s+if=/,                // dd (disk destruction)
  /mkfs\./,                  // filesystem formatting
  /drop\s+database/i,        // database destruction
  /truncate\s+table/i,       // database destruction
  /delete\s+from\s+\w+\s+where\s+1=1/i, // SQL wipe
  /git\s+reset\s+--hard\s+HEAD/, // destructive git reset
  /git\s+clean\s+-fd/,       // destructive git clean
  /chmod\s+000/,             // permission destruction
  /chown\s+-R\s+root/,       // ownership destruction
]

const DANGEROUS_POWERSHELL_PATTERNS = [
  /Remove-Item\s+-Recurse\s+-Force\s+[C-Z]:\\/, // rm drive
  /Remove-Item\s+-Recurse\s+-Force\s+\\/,        // rm root
  /Clear-Disk/,                                   // disk destruction
  /Format-Volume/,                               // filesystem formatting
  /Drop-Database/i,                              // database destruction
  /Remove-Table/i,                               // database destruction
  /git\s+reset\s+--hard\s+HEAD/,                 // destructive git reset
  /git\s+clean\s+-fd/,                           // destructive git clean
]

// Sensitive file paths that should trigger backup warnings
const SENSITIVE_FILE_PATTERNS = [
  /\.env$/,
  /\.env\.\w+$/,
  /config\.json$/,
  /package\.json$/,
  /tsconfig\.json$/,
  /\.gitignore$/,
  /docker-compose\.yml$/,
  /docker-compose\.yaml$/,
  /Dockerfile$/,
]

export type YoloGuardianCheck = {
  isDangerous: boolean
  reason?: string
  requiresConfirmation: boolean
  shouldBackup: boolean
}

/**
 * Check if a tool action is dangerous according to YOLO Guardian rules
 */
export function checkYoloGuardian(
  tool: Tool,
  input: { [key: string]: unknown },
): YoloGuardianCheck {
  const result: YoloGuardianCheck = {
    isDangerous: false,
    requiresConfirmation: false,
    shouldBackup: false,
  }

  // Check Bash commands
  if (tool.name === BASH_TOOL_NAME) {
    const command = input.command as string
    if (typeof command === 'string') {
      const bashCheck = checkBashCommand(command)
      if (bashCheck.isDangerous) {
        result.isDangerous = true
        result.reason = bashCheck.reason
        result.requiresConfirmation = true
      }
    }
  }

  // Check PowerShell commands
  if (tool.name === POWERSHELL_TOOL_NAME) {
    const command = input.command as string
    if (typeof command === 'string') {
      const psCheck = checkPowerShellCommand(command)
      if (psCheck.isDangerous) {
        result.isDangerous = true
        result.reason = psCheck.reason
        result.requiresConfirmation = true
      }
    }
  }

  // Check file operations for sensitive files
  if (tool.name === 'FileEditTool' || tool.name === 'FileWriteTool') {
    const filePath = input.path as string
    if (typeof filePath === 'string') {
      const fileCheck = checkSensitiveFile(filePath)
      if (fileCheck.isDangerous) {
        result.isDangerous = true
        result.reason = fileCheck.reason
        result.shouldBackup = true
      }
    }
  }

  return result
}

function checkBashCommand(command: string): YoloGuardianCheck {
  const lowerCommand = command.toLowerCase()
  
  for (const pattern of DANGEROUS_BASH_PATTERNS) {
    if (pattern.test(lowerCommand)) {
      return {
        isDangerous: true,
        reason: `Dangerous bash command detected: ${command}`,
        requiresConfirmation: true,
        shouldBackup: false,
      }
    }
  }

  return { isDangerous: false, requiresConfirmation: false, shouldBackup: false }
}

function checkPowerShellCommand(command: string): YoloGuardianCheck {
  const lowerCommand = command.toLowerCase()
  
  for (const pattern of DANGEROUS_POWERSHELL_PATTERNS) {
    if (pattern.test(lowerCommand)) {
      return {
        isDangerous: true,
        reason: `Dangerous PowerShell command detected: ${command}`,
        requiresConfirmation: true,
        shouldBackup: false,
      }
    }
  }

  return { isDangerous: false, requiresConfirmation: false, shouldBackup: false }
}

function checkSensitiveFile(filePath: string): YoloGuardianCheck {
  const fileName = filePath.split(/[/\\]/).pop() || ''
  
  for (const pattern of SENSITIVE_FILE_PATTERNS) {
    if (pattern.test(fileName)) {
      return {
        isDangerous: true,
        reason: `Sensitive file detected: ${fileName}`,
        requiresConfirmation: false,
        shouldBackup: true,
      }
    }
  }

  return { isDangerous: false, requiresConfirmation: false, shouldBackup: false }
}

/**
 * Get a user-friendly warning message for YOLO Guardian check
 */
export function getYoloGuardianWarning(check: YoloGuardianCheck): string {
  if (!check.isDangerous) return ''
  
  let message = check.reason || 'Dangerous operation detected'
  
  if (check.requiresConfirmation) {
    message += '\n⚠️  This action requires confirmation in YOLO Lite mode.'
  }
  
  if (check.shouldBackup) {
    message += '\n💾 Auto-backup will be created before editing.'
  }
  
  return message
}
