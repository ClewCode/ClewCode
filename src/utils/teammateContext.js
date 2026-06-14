/**
 * TeammateContext - Runtime context for in-process teammates
 *
 * This module provides AsyncLocalStorage-based context for in-process teammates,
 * enabling concurrent teammate execution without global state conflicts.
 *
 * Relationship with other teammate identity mechanisms:
 * - Env vars (CLAUDE_CODE_AGENT_ID): Process-based teammates spawned via tmux
 * - dynamicTeamContext (teammate.ts): Process-based teammates joining at runtime
 * - TeammateContext (this file): In-process teammates via AsyncLocalStorage
 *
 * The helper functions in teammate.ts check AsyncLocalStorage first, then
 * dynamicTeamContext, then env vars.
 */
import { AsyncLocalStorage } from 'async_hooks';
const teammateContextStorage = new AsyncLocalStorage();
/**
 * Get the current in-process teammate context, if running as one.
 * Returns undefined if not running within an in-process teammate context.
 */
export function getTeammateContext() {
    return teammateContextStorage.getStore();
}
/**
 * Run a function with teammate context set.
 * Used when spawning an in-process teammate to establish its execution context.
 *
 * @param context - The teammate context to set
 * @param fn - The function to run with the context
 * @returns The return value of fn
 */
export function runWithTeammateContext(context, fn) {
    return teammateContextStorage.run(context, fn);
}
/**
 * Check if current execution is within an in-process teammate.
 * This is faster than getTeammateContext() !== undefined for simple checks.
 */
export function isInProcessTeammate() {
    return teammateContextStorage.getStore() !== undefined;
}
/**
 * Create a TeammateContext from spawn configuration.
 * The abortController is passed in by the caller. For in-process teammates,
 * this is typically an independent controller (not linked to parent) so teammates
 * continue running when the leader's query is interrupted.
 *
 * @param config - Configuration for the teammate context
 * @returns A complete TeammateContext with isInProcess: true
 */
export function createTeammateContext(config) {
    return {
        ...config,
        isInProcess: true,
    };
}
