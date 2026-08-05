import type { EffortLevel } from '../effort.js';
import type { PermissionMode } from '../permissions/PermissionMode.js';
import { getSettings_DEPRECATED, updateSettingsForSource } from '../settings/settings.js';

export type TaskMode = 'code' | 'ask' | 'debug' | 'orchestrator' | 'plan';

export type RouterEntry = {
  provider?: string; // omitted = active provider
  model: string;
  effort?: EffortLevel;
};

/**
 * Infer the task mode from a PermissionMode.
 * This is a judgment call since PermissionMode wasn't designed to represent task type.
 *
 * Mapping:
 * - 'plan' → 'plan' (explicit plan mode)
 * - 'bypassPermissions' / 'auto' → 'orchestrator' (coordinating multiple agents)
 * - 'acceptEdits' / 'default' → 'code' (typical interactive coding)
 * - 'ask' → 'ask' (question/answer mode)
 * - 'dontAsk' → 'debug' (debug/diagnostic mode, no user prompts)
 *
 * @param mode The permission mode
 * @returns The inferred task mode
 */
export function inferTaskModeFromPermissionMode(mode: PermissionMode | undefined): TaskMode {
  switch (mode) {
    case 'plan':
      return 'plan';
    case 'bypassPermissions':
    case 'auto':
      return 'orchestrator';
    case 'acceptEdits':
    case 'default':
    case undefined:
      return 'code';
    case 'ask':
      return 'ask';
    case 'dontAsk':
      return 'debug';
    default:
      // Fallback for unknown modes
      return 'code';
  }
}

/**
 * Get the complete router configuration from settings.
 * @returns The configured per-mode model/effort overrides
 */
export function getRouterConfig(): Partial<Record<TaskMode, RouterEntry>> {
  const settings = getSettings_DEPRECATED() || {};
  return settings.modelRouter ?? {};
}

/**
 * Set a router entry for a given task mode.
 * @param mode The task mode
 * @param entry The model/effort/provider override for this mode
 */
export function setRouterEntry(mode: TaskMode, entry: RouterEntry): void {
  const router = getRouterConfig();
  const updated: Partial<Record<TaskMode, RouterEntry>> = { ...router, [mode]: entry };
  updateSettingsForSource('userSettings', { modelRouter: updated as any });
}

/**
 * Remove a router entry for a given task mode (unset the override).
 * @param mode The task mode
 */
export function unsetRouterEntry(mode: TaskMode): void {
  const router = getRouterConfig();
  const updated: Partial<Record<TaskMode, RouterEntry>> = { ...router };
  delete updated[mode];
  updateSettingsForSource('userSettings', { modelRouter: updated as any });
}

/**
 * Resolve the router override for the given permission mode, if any.
 * Returns the model/effort override if configured, undefined otherwise.
 *
 * @param permissionMode The current permission mode
 * @returns The router entry for the inferred task mode, or undefined
 */
export function resolveRouterOverride(permissionMode: PermissionMode | undefined): RouterEntry | undefined {
  const taskMode = inferTaskModeFromPermissionMode(permissionMode);
  return getRouterConfig()[taskMode];
}
