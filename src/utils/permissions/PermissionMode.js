import z from 'zod/v4';
// Types extracted to src/types/permissions.ts to break import cycles
import { EXTERNAL_PERMISSION_MODES, PERMISSION_MODES } from '../../types/permissions.js';
import { lazySchema } from '../lazySchema.js';

// Re-export for backwards compatibility
export { EXTERNAL_PERMISSION_MODES, PERMISSION_MODES };
export const permissionModeSchema = lazySchema(() => z.enum(PERMISSION_MODES));
export const externalPermissionModeSchema = lazySchema(() => z.enum(EXTERNAL_PERMISSION_MODES));
const PERMISSION_MODE_CONFIG = {
  default: {
    title: 'Default',
    shortTitle: 'Default',
    symbol: '',
    color: 'text',
    external: 'default',
  },
  ask: {
    title: 'Ask Mode',
    shortTitle: 'Ask',
    symbol: '?',
    color: 'permission',
    external: 'ask',
  },
  plan: {
    title: 'Plan Mode',
    shortTitle: 'Plan',
    symbol: '⏵⏵',
    color: 'planMode',
    external: 'plan',
  },
  acceptEdits: {
    title: 'Accept edits',
    shortTitle: 'Accept',
    symbol: '⏵⏵',
    color: 'autoAccept',
    external: 'acceptEdits',
  },
  bypassPermissions: {
    title: 'Bypass Permissions',
    shortTitle: 'Bypass',
    symbol: '⏵⏵',
    color: 'error',
    external: 'bypassPermissions',
  },
  dontAsk: {
    title: "Don't Ask",
    shortTitle: 'DontAsk',
    symbol: '⏵⏵',
    color: 'error',
    external: 'dontAsk',
  },
  auto: {
    title: 'Auto mode',
    shortTitle: 'Auto',
    symbol: '⏵⏵',
    color: 'warning',
    external: 'default',
  },
};
/**
 * Type guard to check if a PermissionMode is an ExternalPermissionMode.
 * auto is ant-only and excluded from external modes.
 */
export function isExternalPermissionMode(mode) {
  // External users can't have auto, so always true for them
  if (process.env.USER_TYPE !== 'ant') {
    return true;
  }
  return mode !== 'auto' && mode !== 'bubble';
}
function getModeConfig(mode) {
  return PERMISSION_MODE_CONFIG[mode] ?? PERMISSION_MODE_CONFIG.default;
}
export function toExternalPermissionMode(mode) {
  return getModeConfig(mode).external;
}
export function permissionModeFromString(str) {
  if (str === 'yoloGod') {
    return 'bypassPermissions';
  }
  return PERMISSION_MODES.includes(str) ? str : 'default';
}
export function permissionModeTitle(mode) {
  return getModeConfig(mode).title;
}
export function isDefaultMode(mode) {
  return mode === 'default' || mode === undefined;
}
export function permissionModeShortTitle(mode) {
  return getModeConfig(mode).shortTitle;
}
export function permissionModeSymbol(mode) {
  return getModeConfig(mode).symbol;
}
export function getModeColor(mode) {
  return getModeConfig(mode).color;
}
