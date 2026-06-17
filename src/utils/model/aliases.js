export const MODEL_ALIASES = ['sonnet', 'opus', 'haiku', 'best', 'sonnet[1m]', 'opus[1m]', 'opusplan'];
export function isModelAlias(modelInput) {
  return MODEL_ALIASES.includes(modelInput);
}
/**
 * Bare model family aliases that act as wildcards in the availableModels allowlist.
 * When "opus" is in the allowlist, ANY opus model is allowed (opus 4.5, 4.6, etc.).
 * When a specific model ID is in the allowlist, only that exact version is allowed.
 */
export const MODEL_FAMILY_ALIASES = ['sonnet', 'opus', 'haiku'];
export function isModelFamilyAlias(model) {
  return MODEL_FAMILY_ALIASES.includes(model);
}
