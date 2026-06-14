/**
 * Helper for running forked agent query loops with usage tracking.
 *
 * This utility ensures forked agents:
 * 1. Share identical cache-critical params with the parent to guarantee prompt cache hits
 * 2. Track full usage metrics across the entire query loop
 * 3. Log metrics via the tengu_fork_agent_query event when complete
 * 4. Isolate mutable state to prevent interference with the main agent loop
 */
import { randomUUID } from 'crypto';
import { query } from '../query.js';
import { logEvent, } from '../services/analytics/index.js';
import { accumulateUsage, updateUsage } from '../services/api/claude.js';
import { EMPTY_USAGE } from '../services/api/logging.js';
import { createChildAbortController } from './abortController.js';
import { logForDebugging } from './debug.js';
import { cloneFileStateCache } from './fileStateCache.js';
import { createUserMessage, extractTextContent, getLastAssistantMessage } from './messages.js';
import { createDenialTrackingState } from './permissions/denialTracking.js';
import { parseToolListFromCLI } from './permissions/permissionSetup.js';
import { recordSidechainTranscript } from './sessionStorage.js';
import { cloneContentReplacementState } from './toolResultStorage.js';
import { createAgentId } from './uuid.js';
// Slot written by handleStopHooks after each turn so post-turn forks
// (promptSuggestion, postTurnSummary, /btw) can share the main loop's
// prompt cache without each caller threading params through.
let lastCacheSafeParams = null;
export function saveCacheSafeParams(params) {
    lastCacheSafeParams = params;
}
export function getLastCacheSafeParams() {
    return lastCacheSafeParams;
}
/**
 * Creates CacheSafeParams from REPLHookContext.
 * Use this helper when forking from a post-sampling hook context.
 *
 * To override specific fields (e.g., toolUseContext with cloned file state),
 * spread the result and override: `{ ...createCacheSafeParams(context), toolUseContext: clonedContext }`
 *
 * @param context - The REPLHookContext from the post-sampling hook
 */
export function createCacheSafeParams(context) {
    return {
        systemPrompt: context.systemPrompt,
        userContext: context.userContext,
        systemContext: context.systemContext,
        toolUseContext: context.toolUseContext,
        forkContextMessages: context.messages,
    };
}
/**
 * Creates a modified getAppState that adds allowed tools to the permission context.
 * This is used by forked skill/command execution to grant tool permissions.
 */
export function createGetAppStateWithAllowedTools(baseGetAppState, allowedTools) {
    if (allowedTools.length === 0)
        return baseGetAppState;
    return () => {
        const appState = baseGetAppState();
        return {
            ...appState,
            toolPermissionContext: {
                ...appState.toolPermissionContext,
                alwaysAllowRules: {
                    ...appState.toolPermissionContext.alwaysAllowRules,
                    command: [...new Set([...(appState.toolPermissionContext.alwaysAllowRules.command || []), ...allowedTools])],
                },
            },
        };
    };
}
/**
 * Prepares the context for executing a forked command/skill.
 * This handles the common setup that both SkillTool and slash commands need.
 */
export async function prepareForkedCommandContext(command, args, context) {
    // Get skill content with $ARGUMENTS replaced
    const skillPrompt = await command.getPromptForCommand(args, context);
    const skillContent = skillPrompt.map(block => (block.type === 'text' ? block.text : '')).join('\n');
    // Parse and prepare allowed tools
    const allowedTools = parseToolListFromCLI(command.allowedTools ?? []);
    // Create modified context with allowed tools
    const modifiedGetAppState = createGetAppStateWithAllowedTools(context.getAppState, allowedTools);
    // Use command.agent if specified, otherwise 'general-purpose'
    const agentTypeName = command.agent ?? 'general-purpose';
    const agents = context.options.agentDefinitions.activeAgents;
    const baseAgent = agents.find(a => a.agentType === agentTypeName) ?? agents.find(a => a.agentType === 'general-purpose') ?? agents[0];
    if (!baseAgent) {
        throw new Error('No agent available for forked execution');
    }
    // Prepare prompt messages
    const promptMessages = [createUserMessage({ content: skillContent })];
    return {
        skillContent,
        modifiedGetAppState,
        baseAgent,
        promptMessages,
    };
}
/**
 * Extracts result text from agent messages.
 */
export function extractResultText(agentMessages, defaultText = 'Execution completed') {
    const lastAssistantMessage = getLastAssistantMessage(agentMessages);
    if (!lastAssistantMessage)
        return defaultText;
    const textContent = extractTextContent(lastAssistantMessage.message.content, '\n');
    return textContent || defaultText;
}
/**
 * Creates an isolated ToolUseContext for subagents.
 *
 * By default, ALL mutable state is isolated to prevent interference:
 * - readFileState: cloned from parent
 * - abortController: new controller linked to parent (parent abort propagates)
 * - getAppState: wrapped to set shouldAvoidPermissionPrompts
 * - All mutation callbacks (setAppState, etc.): no-op
 * - Fresh collections: nestedMemoryAttachmentTriggers, toolDecisions
 *
 * Callers can:
 * - Override specific fields via the overrides parameter
 * - Explicitly opt-in to sharing specific callbacks (shareSetAppState, etc.)
 *
 * @param parentContext - The parent's ToolUseContext to create subagent context from
 * @param overrides - Optional overrides and sharing options
 *
 * @example
 * // Full isolation (for background agents like session memory)
 * const ctx = createSubagentContext(parentContext)
 *
 * @example
 * // Custom options and agentId (for AgentTool async agents)
 * const ctx = createSubagentContext(parentContext, {
 *   options: customOptions,
 *   agentId: newAgentId,
 *   messages: initialMessages,
 * })
 *
 * @example
 * // Interactive subagent that shares some state
 * const ctx = createSubagentContext(parentContext, {
 *   options: customOptions,
 *   agentId: newAgentId,
 *   shareSetAppState: true,
 *   shareSetResponseLength: true,
 *   shareAbortController: true,
 * })
 */
export function createSubagentContext(parentContext, overrides) {
    // Determine abortController: explicit override > share parent's > new child
    const abortController = overrides?.abortController ??
        (overrides?.shareAbortController
            ? parentContext.abortController
            : createChildAbortController(parentContext.abortController));
    // Determine getAppState - wrap to set shouldAvoidPermissionPrompts unless sharing abortController
    // (if sharing abortController, it's an interactive agent that CAN show UI)
    const getAppState = overrides?.getAppState
        ? overrides.getAppState
        : overrides?.shareAbortController
            ? parentContext.getAppState
            : () => {
                const state = parentContext.getAppState();
                if (state.toolPermissionContext.shouldAvoidPermissionPrompts) {
                    return state;
                }
                return {
                    ...state,
                    toolPermissionContext: {
                        ...state.toolPermissionContext,
                        shouldAvoidPermissionPrompts: true,
                    },
                };
            };
    return {
        // Mutable state - cloned by default to maintain isolation
        // Clone overrides.readFileState if provided, otherwise clone from parent
        readFileState: cloneFileStateCache(overrides?.readFileState ?? parentContext.readFileState),
        nestedMemoryAttachmentTriggers: new Set(),
        loadedNestedMemoryPaths: new Set(),
        dynamicSkillDirTriggers: new Set(),
        // Per-subagent: tracks skills surfaced by discovery for was_discovered telemetry (SkillTool.ts:116)
        discoveredSkillNames: new Set(),
        toolDecisions: undefined,
        // Budget decisions: override > clone of parent > undefined (feature off).
        //
        // Clone by default (not fresh): cache-sharing forks process parent
        // messages containing parent tool_use_ids. A fresh state would see
        // them as unseen and make divergent replacement decisions → wire
        // prefix differs → cache miss. A clone makes identical decisions →
        // cache hit. For non-forking subagents the parent UUIDs never match
        // — clone is a harmless no-op.
        //
        // Override: AgentTool resume (reconstructed from sidechain records)
        // and inProcessRunner (per-teammate persistent loop state).
        contentReplacementState: overrides?.contentReplacementState ??
            (parentContext.contentReplacementState
                ? cloneContentReplacementState(parentContext.contentReplacementState)
                : undefined),
        // AbortController
        abortController,
        // AppState access
        getAppState,
        setAppState: overrides?.shareSetAppState ? parentContext.setAppState : () => { },
        // Task registration/kill must always reach the root store, even when
        // setAppState is a no-op — otherwise async agents' background bash tasks
        // are never registered and never killed (PPID=1 zombie).
        setAppStateForTasks: parentContext.setAppStateForTasks ?? parentContext.setAppState,
        // Async subagents whose setAppState is a no-op need local denial tracking
        // so the denial counter actually accumulates across retries.
        localDenialTracking: overrides?.shareSetAppState ? parentContext.localDenialTracking : createDenialTrackingState(),
        // Mutation callbacks - no-op by default
        setInProgressToolUseIDs: () => { },
        setResponseLength: overrides?.shareSetResponseLength ? parentContext.setResponseLength : () => { },
        pushApiMetricsEntry: overrides?.shareSetResponseLength ? parentContext.pushApiMetricsEntry : undefined,
        updateFileHistoryState: () => { },
        // Attribution is scoped and functional (prev => next) — safe to share even
        // when setAppState is stubbed. Concurrent calls compose via React's state queue.
        updateAttributionState: parentContext.updateAttributionState,
        // UI callbacks - undefined for subagents (can't control parent UI)
        addNotification: undefined,
        setToolJSX: undefined,
        setStreamMode: undefined,
        setSDKStatus: undefined,
        openMessageSelector: undefined,
        // Fields that can be overridden or copied from parent
        options: overrides?.options ?? parentContext.options,
        messages: overrides?.messages ?? parentContext.messages,
        // Generate new agentId for subagents (each subagent should have its own ID)
        agentId: overrides?.agentId ?? createAgentId(),
        // Capture parent's agent ID for x-claude-code-parent-agent-id header
        parentAgentId: parentContext.agentId,
        agentType: overrides?.agentType,
        // Create new query tracking chain for subagent with incremented depth
        queryTracking: {
            chainId: randomUUID(),
            depth: (parentContext.queryTracking?.depth ?? -1) + 1,
        },
        fileReadingLimits: parentContext.fileReadingLimits,
        userModified: parentContext.userModified,
        criticalSystemReminder_EXPERIMENTAL: overrides?.criticalSystemReminder_EXPERIMENTAL,
        requireCanUseTool: overrides?.requireCanUseTool,
    };
}
/**
 * Runs a forked agent query loop and tracks cache hit metrics.
 *
 * This function:
 * 1. Uses identical cache-safe params from parent to enable prompt caching
 * 2. Accumulates usage across all query iterations
 * 3. Logs tengu_fork_agent_query with full usage when complete
 *
 * @example
 * ```typescript
 * const result = await runForkedAgent({
 *   promptMessages: [createUserMessage({ content: userPrompt })],
 *   cacheSafeParams: {
 *     systemPrompt,
 *     userContext,
 *     systemContext,
 *     toolUseContext: clonedToolUseContext,
 *     forkContextMessages: messages,
 *   },
 *   canUseTool,
 *   querySource: 'session_memory',
 *   forkLabel: 'session_memory',
 * })
 * ```
 */
export async function runForkedAgent({ promptMessages, cacheSafeParams, canUseTool, querySource, forkLabel, overrides, maxOutputTokens, maxTurns, onMessage, skipTranscript, skipCacheWrite, }) {
    const startTime = Date.now();
    const outputMessages = [];
    let totalUsage = { ...EMPTY_USAGE };
    const { systemPrompt, userContext, systemContext, toolUseContext, forkContextMessages } = cacheSafeParams;
    // Create isolated context to prevent mutation of parent state
    const isolatedToolUseContext = createSubagentContext(toolUseContext, overrides);
    // Do NOT filterIncompleteToolCalls here — it drops the whole assistant on
    // partial tool batches, orphaning the paired results (API 400). Dangling
    // tool_uses are repaired downstream by ensureToolResultPairing in claude.ts,
    // same as the main thread — identical post-repair prefix keeps the cache hit.
    const initialMessages = [...forkContextMessages, ...promptMessages];
    // Generate agent ID and record initial messages for transcript
    // When skipTranscript is set, skip agent ID creation and all transcript I/O
    const agentId = skipTranscript ? undefined : createAgentId(forkLabel);
    let lastRecordedUuid = null;
    if (agentId) {
        await recordSidechainTranscript(initialMessages, agentId).catch(err => logForDebugging(`Forked agent [${forkLabel}] failed to record initial transcript: ${err}`));
        // Track the last recorded message UUID for parent chain continuity
        lastRecordedUuid = initialMessages.length > 0 ? initialMessages[initialMessages.length - 1].uuid : null;
    }
    // Run the query loop with isolated context (cache-safe params preserved)
    try {
        for await (const message of query({
            messages: initialMessages,
            systemPrompt,
            userContext,
            systemContext,
            canUseTool,
            toolUseContext: isolatedToolUseContext,
            querySource,
            maxOutputTokensOverride: maxOutputTokens,
            maxTurns,
            skipCacheWrite,
        })) {
            // Extract real usage from message_delta stream events (final usage per API call)
            if (message.type === 'stream_event') {
                if ('event' in message && message.event?.type === 'message_delta' && message.event.usage) {
                    const turnUsage = updateUsage({ ...EMPTY_USAGE }, message.event.usage);
                    totalUsage = accumulateUsage(totalUsage, turnUsage);
                }
                continue;
            }
            if (message.type === 'stream_request_start') {
                continue;
            }
            logForDebugging(`Forked agent [${forkLabel}] received message: type=${message.type}`);
            outputMessages.push(message);
            onMessage?.(message);
            // Record transcript for recordable message types (same pattern as runAgent.ts)
            const msg = message;
            if (agentId && (msg.type === 'assistant' || msg.type === 'user' || msg.type === 'progress')) {
                await recordSidechainTranscript([msg], agentId, lastRecordedUuid).catch(err => logForDebugging(`Forked agent [${forkLabel}] failed to record transcript: ${err}`));
                if (msg.type !== 'progress') {
                    lastRecordedUuid = msg.uuid;
                }
            }
        }
    }
    finally {
        // Release cloned file state cache memory (same pattern as runAgent.ts)
        isolatedToolUseContext.readFileState.clear();
        // Release the cloned fork context messages
        initialMessages.length = 0;
    }
    logForDebugging(`Forked agent [${forkLabel}] finished: ${outputMessages.length} messages, types=[${outputMessages.map(m => m.type).join(', ')}], totalUsage: input=${totalUsage.input_tokens} output=${totalUsage.output_tokens} cacheRead=${totalUsage.cache_read_input_tokens} cacheCreate=${totalUsage.cache_creation_input_tokens}`);
    const durationMs = Date.now() - startTime;
    // Log the fork query metrics with full NonNullableUsage
    logForkAgentQueryEvent({
        forkLabel,
        querySource,
        durationMs,
        messageCount: outputMessages.length,
        totalUsage,
        queryTracking: toolUseContext.queryTracking,
    });
    return {
        messages: outputMessages,
        totalUsage,
    };
}
/**
 * Logs the tengu_fork_agent_query event with full NonNullableUsage fields.
 */
function logForkAgentQueryEvent({ forkLabel, querySource, durationMs, messageCount, totalUsage, queryTracking, }) {
    // Calculate cache hit rate
    const totalInputTokens = totalUsage.input_tokens + totalUsage.cache_creation_input_tokens + totalUsage.cache_read_input_tokens;
    const cacheHitRate = totalInputTokens > 0 ? totalUsage.cache_read_input_tokens / totalInputTokens : 0;
    logEvent('tengu_fork_agent_query', {
        // Metadata
        forkLabel: forkLabel,
        querySource: querySource,
        durationMs,
        messageCount,
        // NonNullableUsage fields
        inputTokens: totalUsage.input_tokens,
        outputTokens: totalUsage.output_tokens,
        cacheReadInputTokens: totalUsage.cache_read_input_tokens,
        cacheCreationInputTokens: totalUsage.cache_creation_input_tokens,
        serviceTier: totalUsage.service_tier,
        cacheCreationEphemeral1hTokens: totalUsage.cache_creation.ephemeral_1h_input_tokens,
        cacheCreationEphemeral5mTokens: totalUsage.cache_creation.ephemeral_5m_input_tokens,
        // Derived metrics
        cacheHitRate,
        // Query tracking
        ...(queryTracking
            ? {
                queryChainId: queryTracking.chainId,
                queryDepth: queryTracking.depth,
            }
            : {}),
    });
}
