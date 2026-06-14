import { getFeatureValue_CACHED_MAY_BE_STALE } from 'src/services/analytics/growthbook.js';
// @[MODEL LAUNCH]: Update tengu_ant_model_override with new ant-only models
// @[MODEL LAUNCH]: Add the codename to scripts/excluded-strings.txt to prevent it from leaking to external builds.
export function getAntModelOverrideConfig() {
    if (process.env.USER_TYPE !== 'ant') {
        return null;
    }
    return getFeatureValue_CACHED_MAY_BE_STALE('tengu_ant_model_override', null);
}
export function getAntModels() {
    if (process.env.USER_TYPE !== 'ant') {
        return [];
    }
    return getAntModelOverrideConfig()?.antModels ?? [];
}
export function resolveAntModel(model) {
    if (process.env.USER_TYPE !== 'ant') {
        return undefined;
    }
    if (model === undefined) {
        return undefined;
    }
    const lower = model.toLowerCase();
    return getAntModels().find(m => m.alias === model || lower.includes(m.model.toLowerCase()));
}
