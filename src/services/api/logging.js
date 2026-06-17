import { feature } from 'bun:bundle';
import { APIError } from '@anthropic-ai/sdk';
import {
  addToTotalDurationState,
  consumePostCompaction,
  getIsNonInteractiveSession,
  getLastApiCompletionTimestamp,
  getTeleportedSessionInfo,
  markFirstTeleportMessageLogged,
  setLastApiCompletionTimestamp,
} from 'src/bootstrap/state.js';
import { isConnectorTextBlock } from 'src/types/connectorText.js';
import { logForDebugging } from 'src/utils/debug.js';
import { logError } from 'src/utils/log.js';
import { getAPIProviderForStatsig } from 'src/utils/model/providers.js';
import { jsonStringify } from 'src/utils/slowOperations.js';
import { logOTelEvent } from 'src/utils/telemetry/events.js';
import { endLLMRequestSpan, isBetaTracingEnabled } from 'src/utils/telemetry/sessionTracing.js';
import { consumeInvokingRequestId } from '../../utils/agentContext.js';
import { logEvent } from '../analytics/index.js';
import { sanitizeToolNameForAnalytics } from '../analytics/metadata.js';
import { EMPTY_USAGE } from './emptyUsage.js';
import { classifyAPIError } from './errors.js';
import { extractConnectionErrorDetails } from './errorUtils.js';

export { EMPTY_USAGE };

function getErrorMessage(error) {
  if (error instanceof APIError) {
    const body = error.error;
    if (body?.error?.message) return body.error.message;
  }
  return error instanceof Error ? error.message : String(error);
}
// Gateway fingerprints for detecting AI gateways from response headers
const GATEWAY_FINGERPRINTS = {
  // https://docs.litellm.ai/docs/proxy/response_headers
  litellm: {
    prefixes: ['x-litellm-'],
  },
  // https://docs.helicone.ai/helicone-headers/header-directory
  helicone: {
    prefixes: ['helicone-'],
  },
  // https://portkey.ai/docs/api-reference/response-schema
  portkey: {
    prefixes: ['x-portkey-'],
  },
  // https://developers.cloudflare.com/ai-gateway/evaluations/add-human-feedback-api/
  'cloudflare-ai-gateway': {
    prefixes: ['cf-aig-'],
  },
  // https://developer.konghq.com/ai-gateway/ — X-Kong-Upstream-Latency, X-Kong-Proxy-Latency
  kong: {
    prefixes: ['x-kong-'],
  },
  // https://www.braintrust.dev/docs/guides/proxy — x-bt-used-endpoint, x-bt-cached
  braintrust: {
    prefixes: ['x-bt-'],
  },
};
// Gateways that use provider-owned domains (not self-hosted), so the
// ANTHROPIC_BASE_URL hostname is a reliable signal even without a
// distinctive response header.
const GATEWAY_HOST_SUFFIXES = {
  // https://docs.databricks.com/aws/en/ai-gateway/
  databricks: ['.cloud.databricks.com', '.azuredatabricks.net', '.gcp.databricks.com'],
};
function detectGateway({ headers, baseUrl }) {
  if (headers) {
    // Header names are already lowercase from the Headers API
    const headerNames = [];
    headers.forEach((_, key) => headerNames.push(key));
    for (const [gw, { prefixes }] of Object.entries(GATEWAY_FINGERPRINTS)) {
      if (prefixes.some(p => headerNames.some(h => h.startsWith(p)))) {
        return gw;
      }
    }
  }
  if (baseUrl) {
    try {
      const host = new URL(baseUrl).hostname.toLowerCase();
      for (const [gw, suffixes] of Object.entries(GATEWAY_HOST_SUFFIXES)) {
        if (suffixes.some(s => host.endsWith(s))) {
          return gw;
        }
      }
    } catch {
      // malformed URL — ignore
    }
  }
  return undefined;
}
function getAnthropicEnvMetadata() {
  return {
    ...(process.env.ANTHROPIC_BASE_URL
      ? {
          baseUrl: process.env.ANTHROPIC_BASE_URL,
        }
      : {}),
    ...(process.env.ANTHROPIC_MODEL
      ? {
          envModel: process.env.ANTHROPIC_MODEL,
        }
      : {}),
    ...(process.env.ANTHROPIC_SMALL_FAST_MODEL
      ? {
          envSmallFastModel: process.env.ANTHROPIC_SMALL_FAST_MODEL,
        }
      : {}),
  };
}
function getBuildAgeMinutes() {
  if (!MACRO.BUILD_TIME) return undefined;
  const buildTime = new Date(MACRO.BUILD_TIME).getTime();
  if (Number.isNaN(buildTime)) return undefined;
  return Math.floor((Date.now() - buildTime) / 60000);
}
export function logAPIQuery({
  model,
  messagesLength,
  temperature,
  betas,
  permissionMode,
  querySource,
  queryTracking,
  thinkingType,
  effortValue,
  fastMode,
  previousRequestId,
}) {
  logEvent('tengu_api_query', {
    model: model,
    messagesLength,
    temperature: temperature,
    provider: getAPIProviderForStatsig(),
    buildAgeMins: getBuildAgeMinutes(),
    ...(betas?.length
      ? {
          betas: betas.join(','),
        }
      : {}),
    permissionMode: permissionMode,
    querySource: querySource,
    ...(queryTracking
      ? {
          queryChainId: queryTracking.chainId,
          queryDepth: queryTracking.depth,
        }
      : {}),
    thinkingType: thinkingType,
    effortValue: effortValue,
    fastMode,
    ...(previousRequestId
      ? {
          previousRequestId: previousRequestId,
        }
      : {}),
    ...getAnthropicEnvMetadata(),
  });
}
export function logAPIError({
  error,
  model,
  messageCount,
  messageTokens,
  durationMs,
  durationMsIncludingRetries,
  attempt,
  requestId,
  clientRequestId,
  didFallBackToNonStreaming,
  promptCategory,
  headers,
  queryTracking,
  querySource,
  llmSpan,
  fastMode,
  previousRequestId,
}) {
  const gateway = detectGateway({
    headers: error instanceof APIError && error.headers ? error.headers : headers,
    baseUrl: process.env.ANTHROPIC_BASE_URL,
  });
  const errStr = getErrorMessage(error);
  const status = error instanceof APIError ? String(error.status) : undefined;
  const errorType = classifyAPIError(error);
  // Log detailed connection error info to debug logs (visible via --debug)
  const connectionDetails = extractConnectionErrorDetails(error);
  if (connectionDetails) {
    const sslLabel = connectionDetails.isSSLError ? ' (SSL error)' : '';
    logForDebugging(
      `Connection error details: code=${connectionDetails.code}${sslLabel}, message=${connectionDetails.message}`,
      { level: 'error' },
    );
  }
  const invocation = consumeInvokingRequestId();
  if (clientRequestId) {
    logForDebugging(
      `API error x-client-request-id=${clientRequestId} (give this to the API team for server-log lookup)`,
      { level: 'error' },
    );
  }
  logError(error);
  logEvent('tengu_api_error', {
    model: model,
    error: errStr,
    status: status,
    errorType: errorType,
    messageCount,
    messageTokens,
    durationMs,
    durationMsIncludingRetries,
    attempt,
    provider: getAPIProviderForStatsig(),
    requestId: requestId || undefined,
    ...(invocation
      ? {
          invokingRequestId: invocation.invokingRequestId,
          invocationKind: invocation.invocationKind,
        }
      : {}),
    clientRequestId: clientRequestId || undefined,
    didFallBackToNonStreaming,
    ...(promptCategory
      ? {
          promptCategory: promptCategory,
        }
      : {}),
    ...(gateway
      ? {
          gateway: gateway,
        }
      : {}),
    ...(queryTracking
      ? {
          queryChainId: queryTracking.chainId,
          queryDepth: queryTracking.depth,
        }
      : {}),
    ...(querySource
      ? {
          querySource: querySource,
        }
      : {}),
    fastMode,
    ...(previousRequestId
      ? {
          previousRequestId: previousRequestId,
        }
      : {}),
    ...getAnthropicEnvMetadata(),
  });
  // Log API error event for OTLP
  void logOTelEvent('api_error', {
    model: model,
    error: errStr,
    status_code: String(status),
    duration_ms: String(durationMs),
    attempt: String(attempt),
    speed: fastMode ? 'fast' : 'normal',
  });
  // Pass the span to correctly match responses to requests when beta tracing is enabled
  endLLMRequestSpan(llmSpan, {
    success: false,
    statusCode: status ? parseInt(status, 10) : undefined,
    error: errStr,
    attempt,
  });
  // Log first error for teleported sessions (reliability tracking)
  const teleportInfo = getTeleportedSessionInfo();
  if (teleportInfo?.isTeleported && !teleportInfo.hasLoggedFirstMessage) {
    logEvent('tengu_teleport_first_message_error', {
      session_id: teleportInfo.sessionId,
      error_type: errorType,
    });
    markFirstTeleportMessageLogged();
  }
}
function logAPISuccess({
  model,
  preNormalizedModel,
  messageCount,
  messageTokens,
  usage,
  durationMs,
  durationMsIncludingRetries,
  attempt,
  ttftMs,
  requestId,
  stopReason,
  costUSD,
  didFallBackToNonStreaming,
  querySource,
  gateway,
  queryTracking,
  permissionMode,
  globalCacheStrategy,
  textContentLength,
  thinkingContentLength,
  toolUseContentLengths,
  connectorTextBlockCount,
  fastMode,
  previousRequestId,
  betas,
}) {
  const isNonInteractiveSession = getIsNonInteractiveSession();
  const isPostCompaction = consumePostCompaction();
  const hasPrintFlag = process.argv.includes('-p') || process.argv.includes('--print');
  const now = Date.now();
  const lastCompletion = getLastApiCompletionTimestamp();
  const timeSinceLastApiCallMs = lastCompletion !== null ? now - lastCompletion : undefined;
  const invocation = consumeInvokingRequestId();
  logEvent('tengu_api_success', {
    model: model,
    ...(preNormalizedModel !== model
      ? {
          preNormalizedModel: preNormalizedModel,
        }
      : {}),
    ...(betas?.length
      ? {
          betas: betas.join(','),
        }
      : {}),
    messageCount,
    messageTokens,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cachedInputTokens: usage.cache_read_input_tokens ?? 0,
    uncachedInputTokens: usage.cache_creation_input_tokens ?? 0,
    durationMs: durationMs,
    durationMsIncludingRetries: durationMsIncludingRetries,
    attempt: attempt,
    ttftMs: ttftMs ?? undefined,
    buildAgeMins: getBuildAgeMinutes(),
    provider: getAPIProviderForStatsig(),
    requestId: requestId ?? undefined,
    ...(invocation
      ? {
          invokingRequestId: invocation.invokingRequestId,
          invocationKind: invocation.invocationKind,
        }
      : {}),
    stop_reason: stopReason ?? undefined,
    costUSD,
    didFallBackToNonStreaming,
    isNonInteractiveSession,
    print: hasPrintFlag,
    isTTY: process.stdout.isTTY ?? false,
    querySource: querySource,
    ...(gateway
      ? {
          gateway: gateway,
        }
      : {}),
    ...(queryTracking
      ? {
          queryChainId: queryTracking.chainId,
          queryDepth: queryTracking.depth,
        }
      : {}),
    permissionMode: permissionMode,
    ...(globalCacheStrategy
      ? {
          globalCacheStrategy: globalCacheStrategy,
        }
      : {}),
    ...(textContentLength !== undefined
      ? {
          textContentLength,
        }
      : {}),
    ...(thinkingContentLength !== undefined
      ? {
          thinkingContentLength,
        }
      : {}),
    ...(toolUseContentLengths !== undefined
      ? {
          toolUseContentLengths: jsonStringify(toolUseContentLengths),
        }
      : {}),
    ...(connectorTextBlockCount !== undefined
      ? {
          connectorTextBlockCount,
        }
      : {}),
    fastMode,
    // Log cache_deleted_input_tokens for cache editing analysis. Casts needed
    // because the field is intentionally not on NonNullableUsage (excluded from
    // external builds). Set by updateUsage() when cache editing is active.
    ...(feature('CACHED_MICROCOMPACT') && (usage.cache_deleted_input_tokens ?? 0) > 0
      ? {
          cacheDeletedInputTokens: usage.cache_deleted_input_tokens,
        }
      : {}),
    ...(previousRequestId
      ? {
          previousRequestId: previousRequestId,
        }
      : {}),
    ...(isPostCompaction ? { isPostCompaction } : {}),
    ...getAnthropicEnvMetadata(),
    timeSinceLastApiCallMs,
  });
  setLastApiCompletionTimestamp(now);
}
export function logAPISuccessAndDuration({
  model,
  preNormalizedModel,
  start,
  startIncludingRetries,
  ttftMs,
  usage,
  attempt,
  messageCount,
  messageTokens,
  requestId,
  stopReason,
  didFallBackToNonStreaming,
  querySource,
  headers,
  costUSD,
  queryTracking,
  permissionMode,
  newMessages,
  llmSpan,
  globalCacheStrategy,
  requestSetupMs,
  attemptStartTimes,
  fastMode,
  previousRequestId,
  betas,
}) {
  const gateway = detectGateway({
    headers,
    baseUrl: process.env.ANTHROPIC_BASE_URL,
  });
  let textContentLength;
  let thinkingContentLength;
  let toolUseContentLengths;
  let connectorTextBlockCount;
  if (newMessages) {
    let textLen = 0;
    let thinkingLen = 0;
    let hasToolUse = false;
    const toolLengths = {};
    let connectorCount = 0;
    for (const msg of newMessages) {
      for (const block of msg.message.content) {
        if (block.type === 'text') {
          textLen += block.text.length;
        } else if (feature('CONNECTOR_TEXT') && isConnectorTextBlock(block)) {
          connectorCount++;
        } else if (block.type === 'thinking') {
          thinkingLen += block.thinking.length;
        } else if (block.type === 'tool_use' || block.type === 'server_tool_use' || block.type === 'mcp_tool_use') {
          const inputLen = jsonStringify(block.input).length;
          const sanitizedName = sanitizeToolNameForAnalytics(block.name);
          toolLengths[sanitizedName] = (toolLengths[sanitizedName] ?? 0) + inputLen;
          hasToolUse = true;
        }
      }
    }
    textContentLength = textLen;
    thinkingContentLength = thinkingLen > 0 ? thinkingLen : undefined;
    toolUseContentLengths = hasToolUse ? toolLengths : undefined;
    connectorTextBlockCount = connectorCount > 0 ? connectorCount : undefined;
  }
  const durationMs = Date.now() - start;
  const durationMsIncludingRetries = Date.now() - startIncludingRetries;
  addToTotalDurationState(durationMsIncludingRetries, durationMs);
  logAPISuccess({
    model,
    preNormalizedModel,
    messageCount,
    messageTokens,
    usage,
    durationMs,
    durationMsIncludingRetries,
    attempt,
    ttftMs,
    requestId,
    stopReason,
    costUSD,
    didFallBackToNonStreaming,
    querySource,
    gateway,
    queryTracking,
    permissionMode,
    globalCacheStrategy,
    textContentLength,
    thinkingContentLength,
    toolUseContentLengths,
    connectorTextBlockCount,
    fastMode,
    previousRequestId,
    betas,
  });
  // Log API request event for OTLP
  void logOTelEvent('api_request', {
    model,
    input_tokens: String(usage.input_tokens),
    output_tokens: String(usage.output_tokens),
    cache_read_tokens: String(usage.cache_read_input_tokens),
    cache_creation_tokens: String(usage.cache_creation_input_tokens),
    cost_usd: String(costUSD),
    duration_ms: String(durationMs),
    speed: fastMode ? 'fast' : 'normal',
  });
  // Extract model output, thinking output, and tool call flag when beta tracing is enabled
  let modelOutput;
  let thinkingOutput;
  let hasToolCall;
  if (isBetaTracingEnabled() && newMessages) {
    // Model output - visible to all users
    modelOutput =
      newMessages.flatMap(m => m.message.content.filter(c => c.type === 'text').map(c => c.text)).join('\n') ||
      undefined;
    // Thinking output - Ant-only (build-time gated)
    if (process.env.USER_TYPE === 'ant') {
      thinkingOutput =
        newMessages
          .flatMap(m => m.message.content.filter(c => c.type === 'thinking').map(c => c.thinking))
          .join('\n') || undefined;
    }
    // Check if any tool_use blocks were in the output
    hasToolCall = newMessages.some(m => m.message.content.some(c => c.type === 'tool_use'));
  }
  // Pass the span to correctly match responses to requests when beta tracing is enabled
  endLLMRequestSpan(llmSpan, {
    success: true,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens: usage.cache_read_input_tokens,
    cacheCreationTokens: usage.cache_creation_input_tokens,
    attempt,
    modelOutput,
    thinkingOutput,
    hasToolCall,
    ttftMs: ttftMs ?? undefined,
    requestSetupMs,
    attemptStartTimes,
  });
  // Log first successful message for teleported sessions (reliability tracking)
  const teleportInfo = getTeleportedSessionInfo();
  if (teleportInfo?.isTeleported && !teleportInfo.hasLoggedFirstMessage) {
    logEvent('tengu_teleport_first_message_success', {
      session_id: teleportInfo.sessionId,
    });
    markFirstTeleportMessageLogged();
  }
}
