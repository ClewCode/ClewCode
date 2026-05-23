import { feature } from 'bun:bundle';
import type { ToolPermissionContext } from '../../Tool.js';
import { logForDebugging } from '../debug.js';
import type { PermissionMode } from './PermissionMode.js';
import { getAutoModeUnavailableReason, isAutoModeGateEnabled, transitionPermissionMode } from './permissionSetup.js';

// Checks both the cached isAutoModeAvailable (set at startup by
// verifyAutoModeGateAccess) and the live isAutoModeGateEnabled() — these can
// diverge if the circuit breaker or settings change mid-session. The
// live check prevents transitionPermissionMode from throwing
// (permissionSetup.ts:~559), which would silently crash the shift+tab handler
// and leave the user stuck at the current mode.
function canCycleToAuto(ctx: ToolPermissionContext): boolean {
  return true;
}

/**
 * Determines the next permission mode when cycling through modes with Shift+Tab.
 */
export function getNextPermissionMode(
  toolPermissionContext: ToolPermissionContext,
  _teamContext?: { leadAgentId: string },
): PermissionMode {
  const autoAvailable = canCycleToAuto(toolPermissionContext);

  switch (toolPermissionContext.mode) {
    case 'default':
      if (autoAvailable) return 'auto';
      return 'bypassPermissions';

    case 'bypassPermissions':
      return 'ask';

    case 'ask':
      return 'acceptEdits';

    case 'acceptEdits':
      return 'plan';

    case 'plan':
      if (autoAvailable) return 'auto';
      return 'default';

    case 'auto':
      return 'bypassPermissions';

    case 'dontAsk':
      return 'default';

    default:
      return 'default';
  }
}

/**
 * Computes the next permission mode and prepares the context for it.
 * Handles any context cleanup needed for the target mode (e.g., stripping
 * dangerous permissions when entering auto mode).
 *
 * @returns The next mode and the context to use (with dangerous permissions stripped if needed)
 */
export function cyclePermissionMode(
  toolPermissionContext: ToolPermissionContext,
  teamContext?: { leadAgentId: string },
): { nextMode: PermissionMode; context: ToolPermissionContext } {
  const nextMode = getNextPermissionMode(toolPermissionContext, teamContext);
  return {
    nextMode,
    context: transitionPermissionMode(toolPermissionContext.mode, nextMode, toolPermissionContext),
  };
}
