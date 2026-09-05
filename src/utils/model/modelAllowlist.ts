import { getSettings } from '../settings/settings.js';
import { parseUserSpecifiedModel } from './model.js';
import { isModelAllowedByList } from './modelAllowlistCore.js';

/**
 * Check whether a model is allowed by the `availableModels` setting.
 *
 * Matching behavior lives in `modelAllowlistCore.ts`; this settings-backed
 * wrapper supplies the full model alias resolver for existing callers.
 */
export function isModelAllowed(model: string): boolean {
  return isModelAllowedByList(model, getSettings()?.availableModels, parseUserSpecifiedModel);
}
