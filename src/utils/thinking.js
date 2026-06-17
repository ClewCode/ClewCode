import { feature } from 'bun:bundle';
import { getProviderRegistryEntry, PROVIDER_IDS } from '../services/ai/providerRegistry.js';
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js';
import { resolveAntModel } from './model/antModels.js';
import { getCanonicalName } from './model/model.js';
import { get3PModelCapabilityOverride } from './model/modelSupportOverrides.js';
import { getAPIProvider, isAnthropicProvider } from './model/providers.js';
import { getSettingsWithErrors } from './settings/settings.js';
/**
 * Build-time gate (feature) + runtime gate (GrowthBook). The build flag
 * controls code inclusion in external builds; the GB flag controls rollout.
 */
export function isUltrathinkEnabled() {
  if (!feature('ULTRATHINK')) {
    return false;
  }
  return getFeatureValue_CACHED_MAY_BE_STALE('tengu_turtle_carbon', true);
}
/**
 * Check if text contains the "ultrathink" keyword.
 */
export function hasUltrathinkKeyword(text) {
  return /\bultrathink\b/i.test(text);
}
/**
 * Check if text contains the "research" keyword.
 */
export function hasResearchKeyword(text) {
  return /\bresearch\b/i.test(text);
}
/**
 * Find positions of "research" keyword in text (for UI highlighting/notification)
 */
export function findResearchTriggerPositions(text) {
  const positions = [];
  const matches = text.matchAll(/\bresearch\b/gi);
  for (const match of matches) {
    if (match.index !== undefined) {
      positions.push({
        word: match[0],
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }
  return positions;
}
/**
 * Find positions of "ultrathink" keyword in text (for UI highlighting/notification)
 */
export function findThinkingTriggerPositions(text) {
  const positions = [];
  // Fresh /g literal each call — String.prototype.matchAll copies lastIndex
  // from the source regex, so a shared instance would leak state from
  // hasUltrathinkKeyword's .test() into this call on the next render.
  const matches = text.matchAll(/\bultrathink\b/gi);
  for (const match of matches) {
    if (match.index !== undefined) {
      positions.push({
        word: match[0],
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }
  return positions;
}
const RAINBOW_COLORS = [
  'rainbow_red',
  'rainbow_orange',
  'rainbow_yellow',
  'rainbow_green',
  'rainbow_blue',
  'rainbow_indigo',
  'rainbow_violet',
];
const RAINBOW_SHIMMER_COLORS = [
  'rainbow_red_shimmer',
  'rainbow_orange_shimmer',
  'rainbow_yellow_shimmer',
  'rainbow_green_shimmer',
  'rainbow_blue_shimmer',
  'rainbow_indigo_shimmer',
  'rainbow_violet_shimmer',
];
export function getRainbowColor(charIndex, shimmer = false) {
  const colors = shimmer ? RAINBOW_SHIMMER_COLORS : RAINBOW_COLORS;
  return colors[charIndex % colors.length];
}
// TODO(inigo): add support for probing unknown models via API error detection
// Provider-aware thinking support detection (aligns with modelSupportsISP in betas.ts)
export function modelSupportsThinking(model) {
  const supported3P = get3PModelCapabilityOverride(model, 'thinking');
  if (supported3P !== undefined) {
    return supported3P;
  }
  if (process.env.USER_TYPE === 'ant') {
    if (resolveAntModel(model.toLowerCase())) {
      return true;
    }
  }
  // IMPORTANT: Do not change thinking support without notifying the model
  // launch DRI and research. This can greatly affect model quality and bashing.
  const canonical = getCanonicalName(model);
  const provider = getAPIProvider();
  // Non-Anthropic providers: check provider capabilities from registry
  if (!isAnthropicProvider()) {
    const modelLower = model.toLowerCase();
    // Check all providers in registry for matching model with reasoningEffort
    for (const providerId of PROVIDER_IDS) {
      try {
        const entry = getProviderRegistryEntry(providerId);
        if (!entry?.capabilities?.reasoningEffort) continue;
        const modelInfo = entry.models?.find(
          m =>
            m.id.toLowerCase() === modelLower ||
            m.id.toLowerCase().includes(modelLower) ||
            modelLower.includes(m.id.toLowerCase()),
        );
        if (modelInfo?.capabilities?.reasoning) return true;
      } catch {
        // Provider not available, skip
      }
    }
    // Fallback: check known patterns for providers not in registry
    if (
      modelLower.includes('gpt-5') ||
      modelLower.includes('o1') ||
      modelLower.includes('o3') ||
      modelLower.includes('o4')
    )
      return true;
    if (modelLower.includes('gemini-2.5') || modelLower.includes('gemini-3')) return true;
    if (modelLower.includes('deepseek-v4')) return true;
    if (modelLower.includes('claude-opus-4') || modelLower.includes('claude-sonnet-4')) return true;
    return false;
  }
  // 1P and Foundry: all Claude 4+ models (including Haiku 4.5)
  if (provider === 'foundry' || provider === 'firstParty') {
    return !canonical.includes('claude-3-');
  }
  // 3P (Bedrock/Vertex): only Opus 4+ and Sonnet 4+
  return canonical.includes('sonnet-4') || canonical.includes('opus-4');
}
// @[MODEL LAUNCH]: Add the new model to the allowlist if it supports adaptive thinking.
export function modelSupportsAdaptiveThinking(model) {
  const supported3P = get3PModelCapabilityOverride(model, 'adaptive_thinking');
  if (supported3P !== undefined) {
    return supported3P;
  }
  const canonical = getCanonicalName(model);
  // Supported by a subset of Claude 4 models
  if (canonical.includes('opus-4-6') || canonical.includes('sonnet-4-6')) {
    return true;
  }
  // Exclude any other known legacy models (allowlist above catches 4-6 variants first)
  if (canonical.includes('opus') || canonical.includes('sonnet') || canonical.includes('haiku')) {
    return false;
  }
  // IMPORTANT: Do not change adaptive thinking support without notifying the
  // model launch DRI and research. This can greatly affect model quality and
  // bashing.
  // Newer models (4.6+) are all trained on adaptive thinking and MUST have it
  // enabled for model testing. DO NOT default to false for first party, otherwise
  // we may silently degrade model quality.
  // Default to true for unknown model strings on 1P and Foundry (because Foundry
  // is a proxy). Do not default to true for other 3P as they have different formats
  // for their model strings.
  const provider = getAPIProvider();
  return provider === 'firstParty' || provider === 'foundry';
}
export function shouldEnableThinkingByDefault() {
  if (process.env.MAX_THINKING_TOKENS) {
    return parseInt(process.env.MAX_THINKING_TOKENS, 10) > 0;
  }
  const { settings } = getSettingsWithErrors();
  if (settings.alwaysThinkingEnabled === false) {
    return false;
  }
  // IMPORTANT: Do not change default thinking enabled value without notifying
  // the model launch DRI and research. This can greatly affect model quality and
  // bashing.
  // Enable thinking by default unless explicitly disabled.
  return true;
}
