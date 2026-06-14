import { getMainLoopModelOverride } from '../../bootstrap/state.js';
import { getSubscriptionType, isClaudeAISubscriber, isMaxSubscriber, isProSubscriber, isTeamPremiumSubscriber, } from '../auth.js';
import { has1mContext, is1mContextDisabled, modelSupports1M } from '../context.js';
import { isEnvTruthy } from '../envUtils.js';
import { getModelStrings, resolveOverriddenModel } from './modelStrings.js';
import { formatModelPricing, getOpus46CostTier } from '../modelCost.js';
import { getSettings_DEPRECATED } from '../settings/settings.js';
import { getAPIProvider, isFirstPartyAnthropicBaseUrl } from './providers.js';
import { LIGHTNING_BOLT } from '../../constants/figures.js';
import { isModelAllowed } from './modelAllowlist.js';
import { isModelAlias } from './aliases.js';
import { capitalize } from '../stringUtils.js';
import { getAntModelOverrideConfig, resolveAntModel } from './antModels.js';
import { PROVIDER_REGISTRY } from '../../services/ai/providerRegistry.js';
import { ProviderManager } from '../../services/ai/ProviderManager.js';
/**
 * @[MULTI_PROVIDER] Returns the small/fast model for the active provider.
 * For Anthropic: ANTHROPIC_SMALL_FAST_MODEL env or Haiku.
 * For non-Anthropic: checks provider registry for a small model, falls back to default.
 */
export function getSmallFastModel() {
    // Anthropic-specific env var
    const envSmallModel = process.env.CLAUDE_CODE_SMALL_FAST_MODEL || process.env.ANTHROPIC_SMALL_FAST_MODEL;
    if (envSmallModel) {
        return envSmallModel;
    }
    // Check provider registry for non-Anthropic small model
    const activeProvider = ProviderManager.getInstance().getActiveProviderName();
    if (activeProvider && activeProvider !== 'anthropic') {
        const registryEntry = PROVIDER_REGISTRY[activeProvider];
        if (registryEntry?.smallFastModel) {
            return registryEntry.smallFastModel;
        }
        if (registryEntry?.defaultModel) {
            return registryEntry.defaultModel;
        }
    }
    // For 3P providers (Bedrock/Vertex/Foundry/gateway) or custom
    // ANTHROPIC_BASE_URL, the default Haiku model ID may not be available.
    // Fall back to the main-loop model so background side-queries don't
    // fail with an unavailable model.
    if (getAPIProvider() !== 'firstParty' || !isFirstPartyAnthropicBaseUrl()) {
        return getMainLoopModel();
    }
    return getDefaultHaikuModel();
}
export function isNonCustomOpusModel(model) {
    return (model === getModelStrings().opus40 ||
        model === getModelStrings().opus41 ||
        model === getModelStrings().opus45 ||
        model === getModelStrings().opus46 ||
        model === getModelStrings().opus47);
}
export function getActiveProviderKeyStatus() {
    const config = ProviderManager.getInstance().getSelectedProviderConfig();
    if (!config?.provider)
        return 'missing';
    const registryEntry = PROVIDER_REGISTRY[config.provider];
    if (!registryEntry)
        return 'missing';
    if (registryEntry.isLocal)
        return 'not-required';
    const hasKey = Boolean(config.apiKeys?.[config.provider] || (registryEntry.envKey && process.env[registryEntry.envKey]));
    return hasKey ? 'valid' : 'missing';
}
/**
 * Helper to get the model from /model (including via /config), the --model flag, environment variable,
 * or the saved settings. The returned value can be a model alias if that's what the user specified.
 * Undefined if the user didn't configure anything, in which case we fall back to
 * the default (null).
 *
 * Priority order within this function:
 * 1. Model override during session (from /model command) - highest priority
 * 2. Model override at startup (from --model flag)
 * 3. CLAUDE_CODE_MODEL environment variable (provider-neutral)
 * 4. ANTHROPIC_MODEL environment variable (legacy, Anthropic-specific)
 * 5. Saved provider config (from /provider command)
 * 6. Settings (from user's saved settings)
 */
export function getUserSpecifiedModelSetting() {
    let specifiedModel;
    const modelOverride = getMainLoopModelOverride();
    if (modelOverride !== undefined) {
        specifiedModel = modelOverride;
    }
    else {
        const settings = getSettings_DEPRECATED() || {};
        // Check environment variables — CLAUDE_CODE_MODEL is provider-neutral
        // and takes priority over the Anthropic-specific ANTHROPIC_MODEL
        const envModel = process.env.CLAUDE_CODE_MODEL || process.env.ANTHROPIC_MODEL;
        if (envModel) {
            specifiedModel = envModel;
        }
        else {
            // Use ProviderManager to get the model
            const providerManager = ProviderManager.getInstance();
            specifiedModel = providerManager.getModelForProvider() || settings.model || undefined;
        }
    }
    // Ignore the user-specified model if it's not in the availableModels allowlist.
    if (specifiedModel && !isModelAllowed(specifiedModel)) {
        return undefined;
    }
    return specifiedModel;
}
/**
 * The Unified Model Resolver:
 * Returns the best model to use based on the current context (Provider, Session, Env, Settings).
 */
export function getUnifiedModel() {
    const providerManager = ProviderManager.getInstance();
    const activeProvider = providerManager.getActiveProviderName();
    // 1. Check for session override from /model
    const modelOverride = getMainLoopModelOverride();
    if (modelOverride) {
        return parseUserSpecifiedModel(modelOverride);
    }
    // 2. Check for environment variable
    const envModel = process.env.CLAUDE_CODE_MODEL || process.env.ANTHROPIC_MODEL;
    if (envModel) {
        return parseUserSpecifiedModel(envModel);
    }
    // 3. Check for provider-specific model in config
    const providerModel = providerManager.getModelForProvider();
    if (providerModel) {
        return parseUserSpecifiedModel(providerModel);
    }
    // 4. Default to provider-specific default or built-in default
    const registryEntry = PROVIDER_REGISTRY[activeProvider];
    if (registryEntry?.defaultModel && activeProvider !== 'anthropic') {
        return parseUserSpecifiedModel(registryEntry.defaultModel);
    }
    return getDefaultMainLoopModel();
}
/**
 * Get the main loop model to use for the current session.
 *
 * Model Selection Priority Order:
 * 1. Model override during session (from /model command) - highest priority
 * 2. Model override at startup (from --model flag)
 * 3. ANTHROPIC_MODEL environment variable
 * 4. Settings (from user's saved settings)
 * 5. Built-in default
 *
 * @returns The resolved model name to use
 */
export function getMainLoopModel() {
    return getUnifiedModel();
}
/**
 * @[MULTI_PROVIDER] Returns the best available model for the active provider.
 * For Anthropic: Opus (largest model).
 * For non-Anthropic: checks provider registry for best model, falls back to default.
 */
export function getBestModel() {
    const activeProvider = ProviderManager.getInstance().getActiveProviderName();
    if (activeProvider && activeProvider !== 'anthropic') {
        const registryEntry = PROVIDER_REGISTRY[activeProvider];
        if (registryEntry?.bestModel)
            return registryEntry.bestModel;
        if (registryEntry?.defaultModel)
            return registryEntry.defaultModel;
    }
    return getDefaultOpusModel();
}
// @[MODEL LAUNCH]: Update the default Opus model (3P providers may lag so keep defaults unchanged).
export function getDefaultOpusModel() {
    const customOpusModel = process.env.CLAUDE_CODE_DEFAULT_OPUS_MODEL || process.env.ANTHROPIC_DEFAULT_OPUS_MODEL;
    if (customOpusModel) {
        return customOpusModel;
    }
    // 3P providers (Bedrock, Vertex, Foundry) — kept as a separate branch
    // even when values match, since 3P availability lags firstParty and
    // these will diverge again at the next model launch.
    if (getAPIProvider() !== 'firstParty') {
        return getModelStrings().opus47;
    }
    return getModelStrings().opus47;
}
// @[MODEL LAUNCH]: Update the default Sonnet model (3P providers may lag so keep defaults unchanged).
export function getDefaultSonnetModel() {
    const customSonnetModel = process.env.CLAUDE_CODE_DEFAULT_SONNET_MODEL || process.env.ANTHROPIC_DEFAULT_SONNET_MODEL;
    if (customSonnetModel) {
        return customSonnetModel;
    }
    // Default to Sonnet 4.5 for 3P since they may not have 4.6 yet
    if (getAPIProvider() !== 'firstParty') {
        return getModelStrings().sonnet45;
    }
    return getModelStrings().sonnet46;
}
// @[MODEL LAUNCH]: Update the default Haiku model (3P providers may lag so keep defaults unchanged).
export function getDefaultHaikuModel() {
    const customHaikuModel = process.env.CLAUDE_CODE_DEFAULT_HAIKU_MODEL || process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL;
    if (customHaikuModel) {
        return customHaikuModel;
    }
    // Haiku 4.5 is available on all platforms (first-party, Foundry, Bedrock, Vertex)
    return getModelStrings().haiku45;
}
/**
 * Get the model to use for runtime, depending on the runtime context.
 * @param params Subset of the runtime context to determine the model to use.
 * @returns The model to use
 */
export function getRuntimeMainLoopModel(params) {
    const { permissionMode, mainLoopModel, exceeds200kTokens = false } = params;
    // opusplan uses Opus in plan mode without [1m] suffix.
    if (getUserSpecifiedModelSetting() === 'opusplan' && permissionMode === 'plan' && !exceeds200kTokens) {
        return getDefaultOpusModel();
    }
    // sonnetplan by default
    if (getUserSpecifiedModelSetting() === 'haiku' && permissionMode === 'plan') {
        return getDefaultSonnetModel();
    }
    return mainLoopModel;
}
/**
 * @[MULTI_PROVIDER] Get the default main loop model setting.
 *
 * Non-Anthropic providers: uses the provider registry's defaultModel.
 * Anthropic provider defaults:
 * - Opus for Max and Team Premium users
 * - Sonnet 4.6 for all other users (including Team Standard, Pro, Enterprise)
 *
 * @returns The default model setting to use
 */
export function getDefaultMainLoopModelSetting() {
    // Non-Anthropic providers: use registry default
    const activeProvider = ProviderManager.getInstance().getActiveProviderName();
    if (activeProvider && activeProvider !== 'anthropic') {
        const registryEntry = PROVIDER_REGISTRY[activeProvider];
        if (registryEntry?.defaultModel) {
            return registryEntry.defaultModel;
        }
    }
    // Ants default to defaultModel from flag config, or Opus 1M if not configured
    if (process.env.USER_TYPE === 'ant') {
        return getAntModelOverrideConfig()?.defaultModel ?? getDefaultOpusModel() + '[1m]';
    }
    // Max users get Opus as default
    if (isMaxSubscriber()) {
        return getDefaultOpusModel() + (isOpus1mMergeEnabled() ? '[1m]' : '');
    }
    // Team Premium gets Opus (same as Max)
    if (isTeamPremiumSubscriber()) {
        return getDefaultOpusModel() + (isOpus1mMergeEnabled() ? '[1m]' : '');
    }
    // PAYG (1P and 3P), Enterprise, Team Standard, and Pro get Sonnet as default
    // Note that PAYG (3P) may default to an older Sonnet model
    return getDefaultSonnetModel();
}
/**
 * Synchronous operation to get the default main loop model to use
 * (bypassing any user-specified values).
 */
export function getDefaultMainLoopModel() {
    return parseUserSpecifiedModel(getDefaultMainLoopModelSetting());
}
// @[MODEL LAUNCH]: Add a canonical name mapping for the new model below.
/**
 * Pure string-match that strips date/provider suffixes from a first-party model
 * name. Input must already be a 1P-format ID (e.g. 'claude-3-7-sonnet-20250219',
 * 'us.anthropic.claude-opus-4-6-v1:0'). Does not touch settings, so safe at
 * module top-level (see MODEL_COSTS in modelCost.ts).
 */
export function firstPartyNameToCanonical(name) {
    name = name.toLowerCase();
    // Special cases for Claude 4+ models to differentiate versions
    // Order matters: check more specific versions first (4-5 before 4)
    if (name.includes('claude-opus-4-7')) {
        return 'claude-opus-4-7';
    }
    if (name.includes('claude-opus-4-6')) {
        return 'claude-opus-4-7';
    }
    if (name.includes('claude-opus-4-5')) {
        return 'claude-opus-4-5';
    }
    if (name.includes('claude-opus-4-1')) {
        return 'claude-opus-4-1';
    }
    if (name.includes('claude-opus-4')) {
        return 'claude-opus-4';
    }
    if (name.includes('claude-sonnet-4-7')) {
        return 'claude-sonnet-4-7';
    }
    if (name.includes('claude-sonnet-4-6')) {
        return 'claude-sonnet-4-7';
    }
    if (name.includes('claude-sonnet-4-5')) {
        return 'claude-sonnet-4-5';
    }
    if (name.includes('claude-sonnet-4')) {
        return 'claude-sonnet-4';
    }
    if (name.includes('claude-haiku-4-5')) {
        return 'claude-haiku-4-5';
    }
    // Claude 3.x models use a different naming scheme (claude-3-{family})
    if (name.includes('claude-3-7-sonnet')) {
        return 'claude-3-7-sonnet';
    }
    if (name.includes('claude-3-5-sonnet')) {
        return 'claude-3-5-sonnet';
    }
    if (name.includes('claude-3-5-haiku')) {
        return 'claude-3-5-haiku';
    }
    if (name.includes('claude-3-opus')) {
        return 'claude-3-opus';
    }
    if (name.includes('claude-3-sonnet')) {
        return 'claude-3-sonnet';
    }
    if (name.includes('claude-3-haiku')) {
        return 'claude-3-haiku';
    }
    const match = name.match(/(claude-(\d+-\d+-)?\w+)/);
    if (match && match[1]) {
        return match[1];
    }
    // Fall back to the original name if no pattern matches
    return name;
}
/**
 * Maps a full model string to a shorter canonical version that's unified across 1P and 3P providers.
 * For example, 'claude-3-5-haiku-20241022' and 'us.anthropic.claude-3-5-haiku-20241022-v1:0'
 * would both be mapped to 'claude-3-5-haiku'.
 * @param fullModelName The full model name (e.g., 'claude-3-5-haiku-20241022')
 * @returns The short name (e.g., 'claude-3-5-haiku') if found, or the original name if no mapping exists
 */
export function getCanonicalName(fullModelName) {
    // Resolve overridden model IDs (e.g. Bedrock ARNs) back to canonical names.
    // resolved is always a 1P-format ID, so firstPartyNameToCanonical can handle it.
    return firstPartyNameToCanonical(resolveOverriddenModel(fullModelName));
}
// @[MODEL LAUNCH]: Update the default model description strings shown to users.
export function getClaudeAiUserDefaultModelDescription(fastMode = false) {
    // Check for env var overrides first
    const customOpusModel = process.env.CLAUDE_CODE_DEFAULT_OPUS_MODEL || process.env.ANTHROPIC_DEFAULT_OPUS_MODEL;
    const customSonnetModel = process.env.CLAUDE_CODE_DEFAULT_SONNET_MODEL || process.env.ANTHROPIC_DEFAULT_SONNET_MODEL;
    if (isMaxSubscriber() || isTeamPremiumSubscriber()) {
        if (customOpusModel) {
            return `Opus (${customOpusModel}) · Most capable for complex work${fastMode ? getOpus46PricingSuffix(true) : ''}`;
        }
        if (isOpus1mMergeEnabled()) {
            return `Opus with 1M context · Most capable for complex work${fastMode ? getOpus46PricingSuffix(true) : ''}`;
        }
        return `Opus · Most capable for complex work${fastMode ? getOpus46PricingSuffix(true) : ''}`;
    }
    if (customSonnetModel) {
        return `Sonnet (${customSonnetModel}) · Best for everyday tasks`;
    }
    return 'Sonnet · Best for everyday tasks';
}
export function renderDefaultModelSetting(setting) {
    if (setting === 'opusplan') {
        return 'Opus in plan mode, else Sonnet';
    }
    return renderModelName(parseUserSpecifiedModel(setting));
}
export function getOpus46PricingSuffix(fastMode) {
    if (getAPIProvider() !== 'firstParty')
        return '';
    const pricing = formatModelPricing(getOpus46CostTier(fastMode));
    const fastModeIndicator = fastMode ? ` (${LIGHTNING_BOLT})` : '';
    return ` ·${fastModeIndicator} ${pricing}`;
}
export function isOpus1mMergeEnabled() {
    if (is1mContextDisabled() || isProSubscriber() || getAPIProvider() !== 'firstParty') {
        return false;
    }
    // Fail closed when a subscriber's subscription type is unknown. The VS Code
    // config-loading subprocess can have OAuth tokens with valid scopes but no
    // subscriptionType field (stale or partial refresh). Without this guard,
    // isProSubscriber() returns false for such users and the merge leaks
    // opus[1m] into the model dropdown — the API then rejects it with a
    // misleading "rate limit reached" error.
    if (isClaudeAISubscriber() && getSubscriptionType() === null) {
        return false;
    }
    return true;
}
export function renderModelSetting(setting, providerOverride) {
    if (setting === 'opusplan') {
        return 'Opus Plan';
    }
    if (isModelAlias(setting)) {
        return capitalize(setting);
    }
    return renderModelName(setting, providerOverride).replace(/^[^:]+:\s*/, '');
}
// @[MODEL LAUNCH]: Add display name cases for the new model (base + [1m] variant if applicable).
/**
 * Returns a human-readable display name for known public models, or null
 * if the model is not recognized as a public model.
 */
export function getPublicModelDisplayName(model) {
    switch (model) {
        case getModelStrings().opus46:
        case getModelStrings().opus47:
            return 'Opus';
        case getModelStrings().opus46 + '[1m]':
        case getModelStrings().opus47 + '[1m]':
            return 'Opus (1M context)';
        case getModelStrings().opus45:
            return 'Opus 4.5';
        case getModelStrings().opus41:
            return 'Opus 4.1';
        case getModelStrings().opus40:
            return 'Opus 4';
        case getModelStrings().sonnet46 + '[1m]':
        case getModelStrings().sonnet47 + '[1m]':
            return 'Sonnet (1M context)';
        case getModelStrings().sonnet46:
        case getModelStrings().sonnet47:
            return 'Sonnet';
        case getModelStrings().sonnet45 + '[1m]':
            return 'Sonnet 4.5 (1M context)';
        case getModelStrings().sonnet45:
            return 'Sonnet 4.5';
        case getModelStrings().sonnet40:
            return 'Sonnet 4';
        case getModelStrings().sonnet40 + '[1m]':
            return 'Sonnet 4 (1M context)';
        case getModelStrings().sonnet37:
            return 'Sonnet 3.7';
        case getModelStrings().sonnet35:
            return 'Sonnet 3.5';
        case getModelStrings().haiku45:
            return 'Haiku 4.5';
        case getModelStrings().haiku35:
            return 'Haiku 3.5';
        default:
            return null;
    }
}
function maskModelCodename(baseName) {
    // Mask only the first dash-separated segment (the codename), preserve the rest
    // e.g. capybara-v2-fast → cap*****-v2-fast
    const [codename = '', ...rest] = baseName.split('-');
    const masked = codename.slice(0, 3) + '*'.repeat(Math.max(0, codename.length - 3));
    return [masked, ...rest].join('-');
}
export function renderModelName(model, providerOverride, style) {
    const formattedModel = model.includes('/') ? model : model.replace(':', '/');
    const publicName = getPublicModelDisplayName(model);
    if (publicName) {
        return publicName;
    }
    // Use the provided override, or get it from ProviderManager (session-aware)
    const provider = providerOverride ||
        (typeof window === 'undefined' ? ProviderManager.getInstance().getActiveProviderName() : undefined) ||
        ProviderManager.getInstance().getSelectedProviderConfig()?.provider;
    if (provider) {
        const registryEntry = PROVIDER_REGISTRY[provider];
        if (registryEntry) {
            // If the model name is just the provider ID/label (no specific model
            // was selected), show only the label to avoid "DeepSeek: deepseek".
            if (model === provider || model === registryEntry.label.toLowerCase()) {
                return registryEntry.label;
            }
            // If the model name already starts with the provider ID or label,
            // return it as is to avoid redundant prefixes like "DeepSeek: deepseek-v4-flash".
            if (model.toLowerCase().startsWith(provider.toLowerCase()) ||
                model.toLowerCase().startsWith(registryEntry.label.toLowerCase())) {
                return formattedModel;
            }
            // If the model name is unknown, show only the provider label
            if (model === 'unknown') {
                return registryEntry.label;
            }
            // 'short' style: bare model name without provider prefix (for stats list)
            if (style === 'short') {
                return formattedModel;
            }
            return `${registryEntry.label}: ${formattedModel}`;
        }
    }
    if (process.env.USER_TYPE === 'ant') {
        const resolved = parseUserSpecifiedModel(model);
        const antModel = resolveAntModel(model);
        if (antModel) {
            const baseName = antModel.model.replace(/\[1m\]$/i, '');
            const masked = maskModelCodename(baseName);
            const suffix = has1mContext(resolved) ? '[1m]' : '';
            return masked + suffix;
        }
        if (resolved !== model) {
            return `${formattedModel} (${resolved})`;
        }
        return resolved;
    }
    return formattedModel;
}
/**
 * Returns a safe author name for public display (e.g., in git commit trailers).
 * Returns "Claude {ModelName}" for publicly known models, or "Claude ({model})"
 * for unknown/internal models so the exact model name is preserved.
 *
 * @param model The full model name
 * @returns "Claude {ModelName}" for public models, or "Claude ({model})" for non-public models
 */
export function getPublicModelName(model) {
    const publicName = getPublicModelDisplayName(model);
    if (publicName) {
        return `Claude ${publicName}`;
    }
    return `Claude (${model})`;
}
/**
 * Returns a full model name for use in this session, possibly after resolving
 * a model alias.
 *
 * This function intentionally does not support version numbers to align with
 * the model switcher.
 *
 * Supports [1m] suffix on any model alias (e.g., haiku[1m], sonnet[1m]) to enable
 * 1M context window without requiring each variant to be in MODEL_ALIASES.
 *
 * @param modelInput The model alias or name provided by the user.
 */
export function parseUserSpecifiedModel(modelInput) {
    const modelInputTrimmed = modelInput.trim();
    const normalizedModel = modelInputTrimmed.toLowerCase();
    const has1mTag = has1mContext(normalizedModel);
    const modelString = has1mTag ? normalizedModel.replace(/\[1m]$/i, '').trim() : normalizedModel;
    if (isModelAlias(modelString)) {
        switch (modelString) {
            case 'opusplan':
                return getDefaultSonnetModel() + (has1mTag ? '[1m]' : ''); // Sonnet is default, Opus in plan mode
            case 'sonnet':
                return getDefaultSonnetModel() + (has1mTag ? '[1m]' : '');
            case 'haiku':
                return getDefaultHaikuModel() + (has1mTag ? '[1m]' : '');
            case 'opus':
                return getDefaultOpusModel() + (has1mTag ? '[1m]' : '');
            case 'best':
                return getBestModel();
            default:
        }
    }
    // Opus 4/4.1 are no longer available on the first-party API (same as
    // Claude.ai) — silently remap to the current Opus default. The 'opus'
    // alias already resolves to the current Opus default, so the only users on these explicit
    // strings pinned them in settings/env/--model/SDK before 4.5 launched.
    // 3P providers may not yet have 4.6 capacity, so pass through unchanged.
    if (getAPIProvider() === 'firstParty' && isLegacyOpusFirstParty(modelString) && isLegacyModelRemapEnabled()) {
        return getDefaultOpusModel() + (has1mTag ? '[1m]' : '');
    }
    if (process.env.USER_TYPE === 'ant') {
        const has1mAntTag = has1mContext(normalizedModel);
        const baseAntModel = normalizedModel.replace(/\[1m]$/i, '').trim();
        const antModel = resolveAntModel(baseAntModel);
        if (antModel) {
            const suffix = has1mAntTag ? '[1m]' : '';
            return antModel.model + suffix;
        }
        // Fall through to the alias string if we cannot load the config. The API calls
        // will fail with this string, but we should hear about it through feedback and
        // can tell the user to restart/wait for flag cache refresh to get the latest values.
    }
    // Preserve original case for custom model names (e.g., Azure Foundry deployment IDs)
    // Only strip [1m] suffix if present, maintaining case of the base model
    if (has1mTag) {
        return modelInputTrimmed.replace(/\[1m\]$/i, '').trim() + '[1m]';
    }
    return modelInputTrimmed;
}
/**
 * Resolves a skill's `model:` frontmatter against the current model, carrying
 * the `[1m]` suffix over when the target family supports it.
 *
 * A skill author writing `model: opus` means "use opus-class reasoning" — not
 * "downgrade to 200K". If the user is on opus[1m] at 230K tokens and invokes a
 * skill with `model: opus`, passing the bare alias through drops the effective
 * context window from 1M to 200K, which trips autocompact at 23% apparent usage
 * and surfaces "Context limit reached" even though nothing overflowed.
 *
 * We only carry [1m] when the target actually supports it (sonnet/opus). A skill
 * with `model: haiku` on a 1M session still downgrades — haiku has no 1M variant,
 * so the autocompact that follows is correct. Skills that already specify [1m]
 * are left untouched.
 */
export function resolveSkillModelOverride(skillModel, currentModel) {
    if (has1mContext(skillModel) || !has1mContext(currentModel)) {
        return skillModel;
    }
    // modelSupports1M matches on canonical IDs ('claude-opus-4-6', 'claude-sonnet-4');
    // a bare 'opus' alias falls through getCanonicalName unmatched. Resolve first.
    if (modelSupports1M(parseUserSpecifiedModel(skillModel))) {
        return skillModel + '[1m]';
    }
    return skillModel;
}
const LEGACY_OPUS_FIRSTPARTY = [
    'claude-opus-4-20250514',
    'claude-opus-4-1-20250805',
    'claude-opus-4-0',
    'claude-opus-4-1',
];
function isLegacyOpusFirstParty(model) {
    return LEGACY_OPUS_FIRSTPARTY.includes(model);
}
/**
 * Opt-out for the legacy Opus 4.0/4.1 → current Opus remap.
 */
export function isLegacyModelRemapEnabled() {
    return !isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_LEGACY_MODEL_REMAP);
}
/**
 * @[MULTI_PROVIDER] Returns a human-readable display string for the model setting.
 * For non-Anthropic providers, shows the provider name + model.
 */
export function modelDisplayString(model) {
    if (model === null) {
        const activeProvider = ProviderManager.getInstance().getActiveProviderName();
        if (activeProvider && activeProvider !== 'anthropic') {
            const providerLabel = activeProvider.charAt(0).toUpperCase() + activeProvider.slice(1);
            return `Default for ${providerLabel} (${getDefaultMainLoopModel()})`;
        }
        if (process.env.USER_TYPE === 'ant') {
            return `Default for Ants (${renderDefaultModelSetting(getDefaultMainLoopModelSetting())})`;
        }
        else if (isClaudeAISubscriber()) {
            return `Default (${getClaudeAiUserDefaultModelDescription()})`;
        }
        return `Default (${getDefaultMainLoopModel()})`;
    }
    const resolvedModel = parseUserSpecifiedModel(model);
    return model === resolvedModel ? resolvedModel : `${model} (${resolvedModel})`;
}
// @[MODEL LAUNCH]: Add a marketing name mapping for the new model below.
export function getMarketingNameForModel(modelId) {
    if (getAPIProvider() === 'foundry') {
        // deployment ID is user-defined in Foundry, so it may have no relation to the actual model
        return undefined;
    }
    const has1m = modelId.toLowerCase().includes('[1m]');
    const canonical = getCanonicalName(modelId);
    if (canonical.includes('claude-opus-4-7') || canonical.includes('claude-opus-4-6')) {
        return has1m ? 'Opus (with 1M context)' : 'Opus';
    }
    if (canonical.includes('claude-opus-4-5')) {
        return 'Opus 4.5';
    }
    if (canonical.includes('claude-opus-4-1')) {
        return 'Opus 4.1';
    }
    if (canonical.includes('claude-opus-4')) {
        return 'Opus 4';
    }
    if (canonical.includes('claude-sonnet-4-7') || canonical.includes('claude-sonnet-4-6')) {
        return has1m ? 'Sonnet (with 1M context)' : 'Sonnet';
    }
    if (canonical.includes('claude-sonnet-4-5')) {
        return has1m ? 'Sonnet 4.5 (with 1M context)' : 'Sonnet 4.5';
    }
    if (canonical.includes('claude-sonnet-4')) {
        return has1m ? 'Sonnet 4 (with 1M context)' : 'Sonnet 4';
    }
    if (canonical.includes('claude-3-7-sonnet')) {
        return 'Claude 3.7 Sonnet';
    }
    if (canonical.includes('claude-3-5-sonnet')) {
        return 'Claude 3.5 Sonnet';
    }
    if (canonical.includes('claude-haiku-4-5')) {
        return 'Haiku 4.5';
    }
    if (canonical.includes('claude-3-5-haiku')) {
        return 'Claude 3.5 Haiku';
    }
    return undefined;
}
export function normalizeModelStringForAPI(model) {
    return model.replace(/\[(1|2)m\]/gi, '');
}
