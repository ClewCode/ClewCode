/**
 * `.call()` override for Computer Use MCP tools.
 * Dispatches tool calls through our cross-platform PlatformAdapter.
 * Handles permission checks before dispatching.
 */

import type { Tool, ToolUseContext } from '../../Tool.js';
import { logForDebugging } from '../debug.js';
import { registerEscKey } from './abortKey.js';
import { handleToolCall } from './mcpServer.js';
import { getComputerUseMCPRenderingOverrides } from './toolRendering.js';

type CallOverride = Pick<Tool, 'call'>['call'];

// ── Permission state ───────────────────────────────────────────────────

type GrantFlags = {
  clipboardRead: boolean;
  clipboardWrite: boolean;
  systemKeyCombos: boolean;
  inputMonitoring: boolean;
};

let currentGrantFlags: GrantFlags = {
  clipboardRead: false,
  clipboardWrite: false,
  systemKeyCombos: false,
  inputMonitoring: false,
};

let escRegistered = false;

/**
 * Check if computer use is permitted for the given action.
 * The first tool call grants all permissions (user-consented by enabling CU).
 */
async function ensurePermission(context: ToolUseContext, _toolName: string): Promise<boolean> {
  // Register Escape key on first tool call
  if (!escRegistered) {
    escRegistered = registerEscKey(() => {
      logForDebugging('[cu-abort] Escape pressed, aborting computer use');
      context.abortController.abort();
    });
    context.sendOSNotification?.({
      message: escRegistered
        ? 'Claude is using your computer · press Esc to stop'
        : 'Claude is using your computer · press Ctrl+C to stop',
      notificationType: 'computer_use_enter',
    });
  }

  // Permission already granted for this session
  if (currentGrantFlags.inputMonitoring) return true;

  // First call: grant all permissions (the model was enabled by user intent)
  // In a full implementation, this would show the ComputerUseApproval dialog.
  currentGrantFlags = {
    clipboardRead: true,
    clipboardWrite: true,
    systemKeyCombos: true,
    inputMonitoring: true,
  };

  return true;
}

/**
 * Returns the full override object for a single `mcp__computer-use__{toolName}`
 * tool: rendering overrides from `toolRendering.tsx` plus a `.call()` that
 * dispatches through our PlatformAdapter.
 */
export function getComputerUseMCPToolOverrides(toolName: string): ReturnType<
  typeof getComputerUseMCPRenderingOverrides
> & {
  call: CallOverride;
} {
  const call: CallOverride = async (args, context: ToolUseContext) => {
    if (!(await ensurePermission(context, toolName))) {
      return { data: [{ type: 'text' as const, text: 'Computer use permission denied by user.' }] };
    }

    const result = await handleToolCall(toolName, args as Record<string, unknown>);

    // Map MCP content blocks to Anthropic API blocks
    const data = Array.isArray(result.content)
      ? result.content.map((item: { type: string; text?: string; data?: string; mimeType?: string }) =>
          item.type === 'image'
            ? {
                type: 'image' as const,
                source: {
                  type: 'base64' as const,
                  media_type: item.mimeType ?? 'image/jpeg',
                  data: item.data!,
                },
              }
            : {
                type: 'text' as const,
                text: item.type === 'text' ? (item.text ?? '') : '',
              },
        )
      : result.content;
    return { data };
  };

  return {
    ...getComputerUseMCPRenderingOverrides(toolName),
    call,
  };
}
