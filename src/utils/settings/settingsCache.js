let sessionSettingsCache = null;
export function getSessionSettingsCache() {
    return sessionSettingsCache;
}
export function setSessionSettingsCache(value) {
    sessionSettingsCache = value;
}
/**
 * Per-source cache for getSettingsForSource. Invalidated alongside the
 * merged sessionSettingsCache — same resetSettingsCache() triggers
 * (settings write, --add-dir, plugin init, hooks refresh).
 */
const perSourceCache = new Map();
export function getCachedSettingsForSource(source) {
    // undefined = cache miss; null = cached "no settings for this source"
    return perSourceCache.has(source) ? perSourceCache.get(source) : undefined;
}
export function setCachedSettingsForSource(source, value) {
    perSourceCache.set(source, value);
}
const parseFileCache = new Map();
export function getCachedParsedFile(path) {
    return parseFileCache.get(path);
}
export function setCachedParsedFile(path, value) {
    parseFileCache.set(path, value);
}
export function resetSettingsCache() {
    sessionSettingsCache = null;
    perSourceCache.clear();
    parseFileCache.clear();
}
/**
 * Plugin settings base layer for the settings cascade.
 * pluginLoader writes here after loading plugins;
 * loadSettingsFromDisk reads it as the lowest-priority base.
 */
let pluginSettingsBase;
export function getPluginSettingsBase() {
    return pluginSettingsBase;
}
export function setPluginSettingsBase(settings) {
    pluginSettingsBase = settings;
}
export function clearPluginSettingsBase() {
    pluginSettingsBase = undefined;
}
