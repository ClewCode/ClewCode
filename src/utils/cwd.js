import { AsyncLocalStorage } from 'async_hooks';
import { getCwdState, getOriginalCwd, getProjectRoot as getProjectRootBase } from '../bootstrap/state.js';
const cwdOverrideStorage = new AsyncLocalStorage();
/**
 * Run a function with an overridden working directory for the current async context.
 * All calls to pwd()/getCwd() within the function (and its async descendants) will
 * return the overridden cwd instead of the global one. This enables concurrent
 * agents to each see their own working directory without affecting each other.
 */
export function runWithCwdOverride(cwd, fn) {
    return cwdOverrideStorage.run(cwd, fn);
}
/**
 * Get the current working directory (respects runWithCwdOverride).
 */
export function pwd() {
    return cwdOverrideStorage.getStore() ?? getCwdState();
}
/**
 * Get the project root (respects runWithCwdOverride).
 * When inside a runWithCwdOverride context, returns the override instead of the
 * stable project root.
 */
export function getProjectRoot() {
    return cwdOverrideStorage.getStore() ?? getProjectRootBase();
}
/**
 * Get the current working directory or the original working directory if the
 * current one is not available.
 */
export function getCwd() {
    try {
        return pwd();
    }
    catch {
        return getOriginalCwd();
    }
}
