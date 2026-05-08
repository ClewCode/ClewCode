/**
 * YOLO Guardian - Safety checks for YOLO Lite mode
 *
 * Provides intelligent safety checks for YOLO Lite mode:
 * - Detects dangerous commands (rm -rf, drop database, etc.)
 * - Auto-backup before editing sensitive files
 * - One-time confirmation for critical operations
 * - Configurable safety rules via settings
 */

import type { Tool } from '../../Tool.js'
import { BASH_TOOL_NAME } from '../../tools/BashTool/toolName.js'
import { FILE_EDIT_TOOL_NAME } from '../../tools/FileEditTool/constants.js'
import { FILE_WRITE_TOOL_NAME } from '../../tools/FileWriteTool/prompt.js'
import { POWERSHELL_TOOL_NAME } from '../../tools/PowerShellTool/toolName.js'
import { logForDebugging } from '../debug.js'
import type { z } from 'zod/v4'
import { YoloGuardianSchema } from '../settings/types.js'

type YoloGuardianSettings = z.infer<ReturnType<typeof YoloGuardianSchema>>

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
  /sudo\s+rm\s+-rf/,         // sudo rm -rf
  /curl\s+.*\|.*sh/,         // curl to shell execution
  /wget\s+.*\|.*sh/,         // wget to shell execution
  /curl\s+.*\|.*bash/,       // curl to bash execution
  /wget\s+.*\|.*bash/,       // wget to bash execution
  /sudo\s+apt-get\s+remove/, // package removal
  /sudo\s+apt-get\s+purge/,  // package purge
  /sudo\s+yum\s+remove/,     // package removal
  /sudo\s+yum\s+erase/,      // package erase
  /sudo\s+dnf\s+remove/,     // package removal
  /systemctl\s+stop/,        // stop services
  /systemctl\s+disable/,     // disable services
  /service\s+stop/,          // stop services
  /kill\s+-9/,               // force kill processes
  /pkill\s+-9/,              // force kill processes
  /killall\s+-9/,            // force kill all
  /:>.*\s+/,                 // truncate files
  /echo\s+.*>\s+\/dev\/null/, // output suppression (potential data loss)
  /mv\s+.*\/dev\/null/,      // move to null
  /cp\s+.*\/dev\/null/,      // copy to null
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
  /Remove-Item\s+-Recurse\s+-Force\s+-Path.*env/, // delete .env files
  /Invoke-WebRequest.*\|.*Invoke-Expression/,    // curl to shell execution
  /Invoke-RestMethod.*\|.*Invoke-Expression/,    // REST to shell execution
  /Stop-Service/,                                 // stop services
  /Disable-Service/,                              // disable services
  /Stop-Process\s+-Force/,                        // force kill processes
  /Kill\s+-Force/,                                // force kill
  /Set-Content.*\$null/,                          // truncate files
  /Out-Null/,                                    // output suppression
  /Remove-Module\s+-Force/,                      // force remove modules
  /Uninstall-Module\s+-Force/,                    // force uninstall modules
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
  /\.git\//,              // .git directory
  /node_modules/,         // node_modules
  /\.next/,               // Next.js build
  /\.nuxt/,               // Nuxt.js build
  /build/,                // build directories
  /dist/,                 // dist directories
  /target/,               // Rust/Java build
  /vendor/,               // PHP/Python dependencies
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
  settings?: YoloGuardianSettings,
): YoloGuardianCheck {
  const result: YoloGuardianCheck = {
    isDangerous: false,
    requiresConfirmation: false,
    shouldBackup: false,
  }

  // Check if YOLO Guardian is disabled
  if (settings?.enabled === false) {
    return result
  }

  // Check Bash commands
  if (tool.name === BASH_TOOL_NAME) {
    const command = input.command as string
    if (typeof command === 'string') {
      const bashCheck = checkBashCommand(command, settings)
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
      const psCheck = checkPowerShellCommand(command, settings)
      if (psCheck.isDangerous) {
        result.isDangerous = true
        result.reason = psCheck.reason
        result.requiresConfirmation = true
      }
    }
  }

  // Check file operations for sensitive files
  if (tool.name === FILE_EDIT_TOOL_NAME || tool.name === FILE_WRITE_TOOL_NAME) {
    const filePath = input.file_path as string
    if (typeof filePath === 'string') {
      const fileCheck = checkSensitiveFile(filePath, settings)
      if (fileCheck.isDangerous) {
        result.isDangerous = true
        result.reason = fileCheck.reason
        result.shouldBackup = true
      }
    }
  }

  // Override with settings
  if (settings?.requireConfirmation && result.isDangerous) {
    result.requiresConfirmation = true
  }
  if (settings?.autoBackup && result.isDangerous) {
    result.shouldBackup = true
  }

  return result
}

function checkBashCommand(command: string, settings?: YoloGuardianSettings): YoloGuardianCheck {
  const lowerCommand = command.toLowerCase()

  // Check built-in patterns
  for (const pattern of DANGEROUS_BASH_PATTERNS) {
    if (pattern.test(lowerCommand)) {
      const customMessage = settings?.customDenyMessages?.[pattern.source]
      return {
        isDangerous: true,
        reason: customMessage || `Dangerous bash command detected: ${command}`,
        requiresConfirmation: true,
        shouldBackup: false,
      }
    }
  }

  // Check custom patterns
  if (settings?.customBashPatterns) {
    for (const patternStr of settings.customBashPatterns) {
      try {
        const pattern = new RegExp(patternStr, 'i')
        if (pattern.test(command)) {
          const customMessage = settings.customDenyMessages?.[patternStr]
          return {
            isDangerous: true,
            reason: customMessage || `Custom dangerous bash pattern matched: ${command}`,
            requiresConfirmation: true,
            shouldBackup: false,
          }
        }
      } catch (e) {
        logForDebugging(`Invalid custom bash pattern: ${patternStr}`, e)
      }
    }
  }

  return { isDangerous: false, requiresConfirmation: false, shouldBackup: false }
}

function checkPowerShellCommand(command: string, settings?: YoloGuardianSettings): YoloGuardianCheck {
  const lowerCommand = command.toLowerCase()

  // Check built-in patterns
  for (const pattern of DANGEROUS_POWERSHELL_PATTERNS) {
    if (pattern.test(lowerCommand)) {
      const customMessage = settings?.customDenyMessages?.[pattern.source]
      return {
        isDangerous: true,
        reason: customMessage || `Dangerous PowerShell command detected: ${command}`,
        requiresConfirmation: true,
        shouldBackup: false,
      }
    }
  }

  // Check custom patterns
  if (settings?.customPowerShellPatterns) {
    for (const patternStr of settings.customPowerShellPatterns) {
      try {
        const pattern = new RegExp(patternStr, 'i')
        if (pattern.test(command)) {
          const customMessage = settings.customDenyMessages?.[patternStr]
          return {
            isDangerous: true,
            reason: customMessage || `Custom dangerous PowerShell pattern matched: ${command}`,
            requiresConfirmation: true,
            shouldBackup: false,
          }
        }
      } catch (e) {
        logForDebugging(`Invalid custom PowerShell pattern: ${patternStr}`, e)
      }
    }
  }

  return { isDangerous: false, requiresConfirmation: false, shouldBackup: false }
}

function checkSensitiveFile(filePath: string, settings?: YoloGuardianSettings): YoloGuardianCheck {
  const fileName = filePath.split(/[/\\]/).pop() || ''
  const normalizedPath = filePath.replace(/\\/g, '/')

  // Check built-in patterns
  for (const pattern of SENSITIVE_FILE_PATTERNS) {
    if (pattern.test(fileName) || pattern.test(normalizedPath)) {
      const customMessage = settings?.customDenyMessages?.[pattern.source]
      return {
        isDangerous: true,
        reason: customMessage || `Sensitive file detected: ${fileName}`,
        requiresConfirmation: false,
        shouldBackup: true,
      }
    }
  }

  // Check custom patterns
  if (settings?.customFilePatterns) {
    for (const patternStr of settings.customFilePatterns) {
      try {
        const pattern = new RegExp(patternStr, 'i')
        if (pattern.test(fileName) || pattern.test(normalizedPath)) {
          const customMessage = settings.customDenyMessages?.[patternStr]
          return {
            isDangerous: true,
            reason: customMessage || `Custom sensitive file pattern matched: ${fileName}`,
            requiresConfirmation: false,
            shouldBackup: true,
          }
        }
      } catch (e) {
        logForDebugging(`Invalid custom file pattern: ${patternStr}`, e)
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
