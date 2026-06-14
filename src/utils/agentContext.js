/**
 * Agent context for analytics attribution using AsyncLocalStorage.
 *
 * This module provides a way to track agent identity across async operations
 * without parameter drilling. Supports two agent types:
 *
 * 1. Subagents (Agent tool): Run in-process for quick, delegated tasks.
 *    Context: SubagentContext with agentType: 'subagent'
 *
 * 2. In-process teammates: Part of a swarm with team coordination.
 *    Context: TeammateAgentContext with agentType: 'teammate'
 *
 * For swarm teammates in separate processes (tmux/iTerm2), use environment
 * variables instead: CLAUDE_CODE_AGENT_ID, CLAUDE_CODE_PARENT_SESSION_ID
 *
 * WHY AsyncLocalStorage (not AppState):
 * When agents are backgrounded (ctrl+b), multiple agents can run concurrently
 * in the same process. AppState is a single shared state that would be
 * overwritten, causing Agent A's events to incorrectly use Agent B's context.
 * AsyncLocalStorage isolates each async execution chain, so concurrent agents
 * don't interfere with each other.
 */
import { AsyncLocalStorage } from 'async_hooks';
import { isAgentSwarmsEnabled } from './agentSwarmsEnabled.js';
const agentContextStorage = new AsyncLocalStorage();
/**
 * Get the current agent context, if any.
 * Returns undefined if not running within an agent context (subagent or teammate).
 * Use type guards isSubagentContext() or isTeammateAgentContext() to narrow the type.
 */
export function getAgentContext() {
    return agentContextStorage.getStore();
}
/**
 * Run an async function with the given agent context.
 * All async operations within the function will have access to this context.
 */
export function runWithAgentContext(context, fn) {
    return agentContextStorage.run(context, fn);
}
/**
 * Type guard to check if context is a SubagentContext.
 */
export function isSubagentContext(context) {
    return context?.agentType === 'subagent';
}
/**
 * Type guard to check if context is a TeammateAgentContext.
 */
export function isTeammateAgentContext(context) {
    if (isAgentSwarmsEnabled()) {
        return context?.agentType === 'teammate';
    }
    return false;
}
/**
 * Get the subagent name suitable for analytics logging.
 * Returns the agent type name for built-in agents, "user-defined" for custom agents,
 * or undefined if not running within a subagent context.
 *
 * Safe for analytics metadata: built-in agent names are code constants,
 * and custom agents are always mapped to the literal "user-defined".
 */
export function getSubagentLogName() {
    const context = getAgentContext();
    if (!isSubagentContext(context) || !context.subagentName) {
        return undefined;
    }
    return (context.isBuiltIn ? context.subagentName : 'user-defined');
}
/**
 * Get the invoking request_id for the current agent context — once per
 * invocation. Returns the id on the first call after a spawn/resume, then
 * undefined until the next boundary. Also undefined on the main thread or
 * when the spawn path had no request_id.
 *
 * Sparse edge semantics: invokingRequestId appears on exactly one
 * tengu_api_success/error per invocation, so a non-NULL value downstream
 * marks a spawn/resume boundary.
 */
export function consumeInvokingRequestId() {
    const context = getAgentContext();
    if (!context?.invokingRequestId || context.invocationEmitted) {
        return undefined;
    }
    context.invocationEmitted = true;
    return {
        invokingRequestId: context.invokingRequestId,
        invocationKind: context.invocationKind,
    };
}
