import { readFileSync } from '../fileRead.js';
import { getFsImplementation, safeResolvePath } from '../fsOperations.js';
import { safeParseJSON } from '../json.js';
import { logError } from '../log.js';
import { getEnabledSettingSources } from '../settings/constants.js';
import { getSettingsFilePathForSource, getSettingsForSource, updateSettingsForSource } from '../settings/settings.js';
import { permissionRuleValueFromString, permissionRuleValueToString } from './permissionRuleParser.js';
/**
 * Returns true if allowManagedPermissionRulesOnly is enabled in managed settings (policySettings).
 * When enabled, only permission rules from managed settings are respected.
 */
export function shouldAllowManagedPermissionRulesOnly() {
  return getSettingsForSource('policySettings')?.allowManagedPermissionRulesOnly === true;
}
/**
 * Returns true if "always allow" options should be shown in permission prompts.
 * When allowManagedPermissionRulesOnly is enabled, these options are hidden.
 */
export function shouldShowAlwaysAllowOptions() {
  return !shouldAllowManagedPermissionRulesOnly();
}
const SUPPORTED_RULE_BEHAVIORS = ['allow', 'deny', 'ask'];
/**
 * Lenient version of getSettingsForSource that doesn't fail on ANY validation errors.
 * Simply parses the JSON and returns it as-is without schema validation.
 *
 * Used when loading settings to append new rules (avoids losing existing rules
 * due to validation failures in unrelated fields like hooks).
 *
 * FOR EDITING ONLY - do not use this for reading settings for execution.
 */
function getSettingsForSourceLenient_FOR_EDITING_ONLY_NOT_FOR_READING(source) {
  const filePath = getSettingsFilePathForSource(source);
  if (!filePath) {
    return null;
  }
  try {
    const { resolvedPath } = safeResolvePath(getFsImplementation(), filePath);
    const content = readFileSync(resolvedPath);
    if (content.trim() === '') {
      return {};
    }
    const data = safeParseJSON(content, false);
    // Return raw parsed JSON without validation to preserve all existing settings
    // This is safe because we're only using this for reading/appending, not for execution
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}
/**
 * Converts permissions JSON to an array of PermissionRule objects
 * @param data The parsed permissions data
 * @param source The source of these rules
 * @returns Array of PermissionRule objects
 */
function settingsJsonToRules(data, source) {
  if (!data?.permissions) {
    return [];
  }
  const { permissions } = data;
  const rules = [];
  for (const behavior of SUPPORTED_RULE_BEHAVIORS) {
    const behaviorArray = permissions[behavior];
    if (behaviorArray) {
      for (const ruleString of behaviorArray) {
        rules.push({
          source,
          ruleBehavior: behavior,
          ruleValue: permissionRuleValueFromString(ruleString),
        });
      }
    }
  }
  return rules;
}
/**
 * Loads all permission rules from all relevant sources (managed and project settings)
 * @returns Array of all permission rules
 */
export function loadAllPermissionRulesFromDisk() {
  // If allowManagedPermissionRulesOnly is set, only use managed permission rules
  if (shouldAllowManagedPermissionRulesOnly()) {
    return getPermissionRulesForSource('policySettings');
  }
  // Otherwise, load from all enabled sources (backwards compatible)
  const rules = [];
  for (const source of getEnabledSettingSources()) {
    rules.push(...getPermissionRulesForSource(source));
  }
  return rules;
}
/**
 * Loads permission rules from a specific source
 * @param source The source to load from
 * @returns Array of permission rules from that source
 */
export function getPermissionRulesForSource(source) {
  const settingsData = getSettingsForSource(source);
  return settingsJsonToRules(settingsData, source);
}
// Editable sources that can be modified (excludes policySettings and flagSettings)
const EDITABLE_SOURCES = ['userSettings', 'projectSettings', 'localSettings'];
/**
 * Deletes a rule from the project permissions file
 * @param rule The rule to delete
 * @returns Promise resolving to a boolean indicating success
 */
export function deletePermissionRuleFromSettings(rule) {
  // Runtime check to ensure source is actually editable
  if (!EDITABLE_SOURCES.includes(rule.source)) {
    return false;
  }
  const ruleString = permissionRuleValueToString(rule.ruleValue);
  const settingsData = getSettingsForSource(rule.source);
  // If there's no settings data or permissions, nothing to do
  if (!settingsData?.permissions) {
    return false;
  }
  const behaviorArray = settingsData.permissions[rule.ruleBehavior];
  if (!behaviorArray) {
    return false;
  }
  // Normalize raw settings entries via roundtrip parse→serialize so legacy
  // names (e.g. "KillShell") match their canonical form ("TaskStop").
  const normalizeEntry = raw => permissionRuleValueToString(permissionRuleValueFromString(raw));
  if (!behaviorArray.some(raw => normalizeEntry(raw) === ruleString)) {
    return false;
  }
  try {
    // Keep a copy of the original permissions data to preserve unrecognized keys
    const updatedSettingsData = {
      ...settingsData,
      permissions: {
        ...settingsData.permissions,
        [rule.ruleBehavior]: behaviorArray.filter(raw => normalizeEntry(raw) !== ruleString),
      },
    };
    const { error } = updateSettingsForSource(rule.source, updatedSettingsData);
    if (error) {
      // Error already logged inside updateSettingsForSource
      return false;
    }
    return true;
  } catch (error) {
    logError(error);
    return false;
  }
}
function getEmptyPermissionSettingsJson() {
  return {
    permissions: {},
  };
}
/**
 * Adds rules to the project permissions file
 * @param ruleValues The rule values to add
 * @returns Promise resolving to a boolean indicating success
 */
export function addPermissionRulesToSettings({ ruleValues, ruleBehavior }, source) {
  // When allowManagedPermissionRulesOnly is enabled, don't persist new permission rules
  if (shouldAllowManagedPermissionRulesOnly()) {
    return false;
  }
  if (ruleValues.length < 1) {
    // No rules to add
    return true;
  }
  const ruleStrings = ruleValues.map(permissionRuleValueToString);
  // First try the normal settings loader which validates the schema
  // If validation fails, fall back to lenient loading to preserve existing rules
  // even if some fields (like hooks) have validation errors
  const settingsData =
    getSettingsForSource(source) ||
    getSettingsForSourceLenient_FOR_EDITING_ONLY_NOT_FOR_READING(source) ||
    getEmptyPermissionSettingsJson();
  try {
    // Ensure permissions object exists
    const existingPermissions = settingsData.permissions || {};
    const existingRules = existingPermissions[ruleBehavior] || [];
    // Filter out duplicates - normalize existing entries via roundtrip
    // parse→serialize so legacy names match their canonical form.
    const existingRulesSet = new Set(
      existingRules.map(raw => permissionRuleValueToString(permissionRuleValueFromString(raw))),
    );
    const newRules = ruleStrings.filter(rule => !existingRulesSet.has(rule));
    // If no new rules to add, return success
    if (newRules.length === 0) {
      return true;
    }
    // Keep a copy of the original settings data to preserve unrecognized keys
    const updatedSettingsData = {
      ...settingsData,
      permissions: {
        ...existingPermissions,
        [ruleBehavior]: [...existingRules, ...newRules],
      },
    };
    const result = updateSettingsForSource(source, updatedSettingsData);
    if (result.error) {
      throw result.error;
    }
    return true;
  } catch (error) {
    logError(error);
    return false;
  }
}
