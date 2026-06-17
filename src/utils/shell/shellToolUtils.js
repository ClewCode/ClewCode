import { BASH_TOOL_NAME } from '../../tools/BashTool/toolName.js';
import { POWERSHELL_TOOL_NAME } from '../../tools/PowerShellTool/toolName.js';
import { isEnvDefinedFalsy, isEnvTruthy } from '../envUtils.js';
import { getAPIProvider } from '../model/providers.js';
import { getPlatform } from '../platform.js';
export const SHELL_TOOL_NAMES = [BASH_TOOL_NAME, POWERSHELL_TOOL_NAME];
/**
 * Runtime gate for PowerShellTool. Windows-only (the permission engine uses
 * Win32-specific path normalizations). Ant defaults on (opt-out via env=0);
 * Bedrock/Vertex/Foundry defaults on (opt-out via CLAUDE_CODE_USE_POWERSHELL_TOOL=0);
 * external defaults off (opt-in via env=1).
 *
 * Used by tools.ts (tool-list visibility), processBashCommand (! routing),
 * and promptShellExecution (skill frontmatter routing) so the gate is
 * consistent across all paths that invoke PowerShellTool.call().
 */
export function isPowerShellToolEnabled() {
  if (getPlatform() !== 'windows') return false;
  // Ant internal: default on, opt out with env=0
  if (process.env.USER_TYPE === 'ant') {
    return !isEnvDefinedFalsy(process.env.CLAUDE_CODE_USE_POWERSHELL_TOOL);
  }
  // Bedrock/Vertex/Foundry: default on, opt out with CLAUDE_CODE_USE_POWERSHELL_TOOL=0
  const provider = getAPIProvider();
  if (provider === 'bedrock' || provider === 'vertex' || provider === 'foundry') {
    return !isEnvDefinedFalsy(process.env.CLAUDE_CODE_USE_POWERSHELL_TOOL);
  }
  // External: opt-in with env=1
  return isEnvTruthy(process.env.CLAUDE_CODE_USE_POWERSHELL_TOOL);
}
