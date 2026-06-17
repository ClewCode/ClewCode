import { ALLOWED_OFFICIAL_MARKETPLACE_NAMES } from './schemas.js';
/**
 * Map from SettingSource to plugin scope.
 * Note: flagSettings maps to 'flag' which is session-only and not persisted.
 */
export const SETTING_SOURCE_TO_SCOPE = {
  policySettings: 'managed',
  userSettings: 'user',
  projectSettings: 'project',
  localSettings: 'local',
  flagSettings: 'flag',
};
/**
 * Parse a plugin identifier string into name and marketplace components
 * @param plugin The plugin identifier (name or name@marketplace)
 * @returns Parsed plugin name and optional marketplace
 *
 * Note: Only the first '@' is used as separator. If the input contains multiple '@' symbols
 * (e.g., "plugin@market@place"), everything after the second '@' is ignored.
 * This is intentional as marketplace names should not contain '@'.
 */
export function parsePluginIdentifier(plugin) {
  if (plugin.includes('@')) {
    const parts = plugin.split('@');
    return { name: parts[0] || '', marketplace: parts[1] };
  }
  return { name: plugin };
}
/**
 * Build a plugin ID from name and marketplace
 * @param name The plugin name
 * @param marketplace Optional marketplace name
 * @returns Plugin ID in format "name" or "name@marketplace"
 */
export function buildPluginId(name, marketplace) {
  return marketplace ? `${name}@${marketplace}` : name;
}
/**
 * Check if a marketplace name is an official (Anthropic-controlled) marketplace.
 * Used for telemetry redaction — official plugin identifiers are safe to log to
 * general-access additional_metadata; third-party identifiers go only to the
 * PII-tagged _PROTO_* BQ columns.
 */
export function isOfficialMarketplaceName(marketplace) {
  return marketplace !== undefined && ALLOWED_OFFICIAL_MARKETPLACE_NAMES.has(marketplace.toLowerCase());
}
/**
 * Map from installable plugin scope to editable setting source.
 * This is the inverse of SETTING_SOURCE_TO_SCOPE for editable scopes only.
 * Note: 'managed' scope cannot be installed to, so it's not included here.
 */
const SCOPE_TO_EDITABLE_SOURCE = {
  user: 'userSettings',
  project: 'projectSettings',
  local: 'localSettings',
};
/**
 * Convert a plugin scope to its corresponding editable setting source
 * @param scope The plugin installation scope
 * @returns The corresponding setting source for reading/writing settings
 * @throws Error if scope is 'managed' (cannot install plugins to managed scope)
 */
export function scopeToSettingSource(scope) {
  if (scope === 'managed') {
    throw new Error('Cannot install plugins to managed scope');
  }
  return SCOPE_TO_EDITABLE_SOURCE[scope];
}
/**
 * Convert an editable setting source to its corresponding plugin scope.
 * Derived from SETTING_SOURCE_TO_SCOPE to maintain a single source of truth.
 * @param source The setting source
 * @returns The corresponding plugin scope
 */
export function settingSourceToScope(source) {
  return SETTING_SOURCE_TO_SCOPE[source];
}
