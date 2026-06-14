import { toError } from '../errors.js';
import { logError } from '../log.js';
// Internal registry for post-sampling hooks
const postSamplingHooks = [];
/**
 * Register a post-sampling hook that will be called after model sampling completes
 * This is an internal API not exposed through settings
 */
export function registerPostSamplingHook(hook) {
    postSamplingHooks.push(hook);
}
/**
 * Clear all registered post-sampling hooks (for testing)
 */
export function clearPostSamplingHooks() {
    postSamplingHooks.length = 0;
}
/**
 * Execute all registered post-sampling hooks
 */
export async function executePostSamplingHooks(messages, systemPrompt, userContext, systemContext, toolUseContext, querySource) {
    const context = {
        messages,
        systemPrompt,
        userContext,
        systemContext,
        toolUseContext,
        querySource,
    };
    for (const hook of postSamplingHooks) {
        try {
            await hook(context);
        }
        catch (error) {
            // Log but don't fail on hook errors
            logError(toError(error));
        }
    }
}
