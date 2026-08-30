/**
 * Dynamic Tool Masking — filters tool schemas from API payloads
 * based on active session mode (default, plan, read-only, minimal).
 * Saves 3,000–5,000 tokens on every request when in non-destructive modes.
 */

import type { Tools } from '../Tool.js';

export type ToolMaskingMode = 'default' | 'plan' | 'read-only' | 'minimal';

/** Tools strictly prohibited in Plan and Read-Only modes */
const WRITE_AND_EXEC_TOOLS = new Set([
  'FileEdit',
  'FileWrite',
  'NotebookEdit',
  'Bash',
  'PowerShell',
  'BrowserTool',
  'ComputerUse',
  'TeamCreate',
  'TeamDelete',
  'RemoteTrigger',
  'Workflow',
  'ScheduleCron',
  'ScheduleFollowup',
]);

/** Minimal essential core 6 tools */
const MINIMAL_CORE_TOOLS = new Set(['FileRead', 'FileEdit', 'FileWrite', 'Bash', 'Glob', 'Grep', 'AskUserQuestion']);

export function filterToolsByMask(tools: Tools, mode: ToolMaskingMode = 'default'): Tools {
  if (mode === 'default') {
    return tools;
  }

  if (mode === 'plan' || mode === 'read-only') {
    return tools.filter(tool => !WRITE_AND_EXEC_TOOLS.has(tool.name));
  }

  if (mode === 'minimal') {
    return tools.filter(tool => MINIMAL_CORE_TOOLS.has(tool.name));
  }

  return tools;
}

export function isToolAllowedInMode(toolName: string, mode: ToolMaskingMode): boolean {
  if (mode === 'default') return true;
  if (mode === 'plan' || mode === 'read-only') {
    return !WRITE_AND_EXEC_TOOLS.has(toolName);
  }
  if (mode === 'minimal') {
    return MINIMAL_CORE_TOOLS.has(toolName);
  }
  return true;
}
