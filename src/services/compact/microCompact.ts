import { feature } from 'bun:bundle';
import type { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/index.mjs';
import type { QuerySource } from '../../constants/querySource.js';
import type { ToolUseContext } from '../../Tool.js';
import { FILE_EDIT_TOOL_NAME } from '../../tools/FileEditTool/constants.js';
import { FILE_READ_TOOL_NAME } from '../../tools/FileReadTool/prompt.js';
import { FILE_WRITE_TOOL_NAME } from '../../tools/FileWriteTool/prompt.js';
import { GLOB_TOOL_NAME } from '../../tools/GlobTool/prompt.js';
import { GREP_TOOL_NAME } from '../../tools/GrepTool/prompt.js';
import { WEB_FETCH_TOOL_NAME } from '../../tools/WebFetchTool/prompt.js';
import { WEB_SEARCH_TOOL_NAME } from '../../tools/WebSearchTool/prompt.js';
import type { Message } from '../../types/message.js';
import { logForDebugging } from '../../utils/debug.js';
import { SHELL_TOOL_NAMES } from '../../utils/shell/shellToolUtils.js';
import { jsonStringify } from '../../utils/slowOperations.js';
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../analytics/growthbook.js';
import { type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS, logEvent } from '../analytics/index.js';
import { notifyCacheDeletion } from '../api/promptCacheBreakDetection.js';
import { roughTokenCountEstimation } from '../tokenEstimation.js';
import { clearCompactWarningSuppression, suppressCompactWarning } from './compactWarningState.js';
import { getTimeBasedMCConfig, type TimeBasedMCConfig } from './timeBasedMCConfig.js';

// Inline from utils/toolResultStorage.ts — importing that file pulls in
// sessionStorage → utils/messages → services/api/errors, completing a
// circular-deps loop back through this file via promptCacheBreakDetection.
// Drift is caught by a test asserting equality with the source-of-truth.
export const TIME_BASED_MC_CLEARED_MESSAGE = '[Old tool result content cleared]';
export const DUPLICATE_TOOL_RESULT_CLEARED_MESSAGE =
  '[Old duplicate tool result cleared; latest identical tool call result kept]';

const IMAGE_MAX_TOKEN_SIZE = 2000;
const DUPLICATE_TOOL_RESULT_MIN_CHARS = 800;

// Only compact these tools
const COMPACTABLE_TOOLS = new Set<string>([
  FILE_READ_TOOL_NAME,
  ...SHELL_TOOL_NAMES,
  GREP_TOOL_NAME,
  GLOB_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
  WEB_FETCH_TOOL_NAME,
  FILE_EDIT_TOOL_NAME,
  FILE_WRITE_TOOL_NAME,
]);

const DUPLICATE_COMPACTABLE_TOOLS = new Set<string>([
  GREP_TOOL_NAME,
  GLOB_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
  WEB_FETCH_TOOL_NAME,
]);

// Helper to calculate tool result tokens
function calculateToolResultTokens(block: ToolResultBlockParam): number {
  if (!block.content) {
    return 0;
  }

  if (typeof block.content === 'string') {
    return roughTokenCountEstimation(block.content);
  }

  // Array of TextBlockParam | ImageBlockParam | DocumentBlockParam
  return block.content.reduce((sum, item) => {
    if (item.type === 'text') {
      return sum + roughTokenCountEstimation(item.text);
    } else if (item.type === 'image' || item.type === 'document') {
      // Images/documents are approximately 2000 tokens regardless of format
      return sum + IMAGE_MAX_TOKEN_SIZE;
    }
    return sum;
  }, 0);
}

/**
 * Estimate token count for messages by extracting text content
 * Used for rough token estimation when we don't have accurate API counts
 * Pads estimate by 4/3 to be conservative since we're approximating
 */
export function estimateMessageTokens(messages: Message[]): number {
  let totalTokens = 0;

  for (const message of messages) {
    if (message.type !== 'user' && message.type !== 'assistant') {
      continue;
    }

    if (!Array.isArray(message.message.content)) {
      continue;
    }

    for (const block of message.message.content) {
      if (block.type === 'text') {
        totalTokens += roughTokenCountEstimation(block.text);
      } else if (block.type === 'tool_result') {
        totalTokens += calculateToolResultTokens(block);
      } else if (block.type === 'image' || block.type === 'document') {
        totalTokens += IMAGE_MAX_TOKEN_SIZE;
      } else if (block.type === 'thinking') {
        // Match roughTokenCountEstimationForBlock: count only the thinking
        // text, not the JSON wrapper or signature (signature is metadata,
        // not model-tokenized content).
        totalTokens += roughTokenCountEstimation(block.thinking);
      } else if (block.type === 'redacted_thinking') {
        totalTokens += roughTokenCountEstimation(block.data);
      } else if (block.type === 'tool_use') {
        // Match roughTokenCountEstimationForBlock: count name + input,
        // not the JSON wrapper or id field.
        totalTokens += roughTokenCountEstimation(block.name + jsonStringify(block.input ?? {}));
      } else {
        // server_tool_use, web_search_tool_result, etc.
        totalTokens += roughTokenCountEstimation(jsonStringify(block));
      }
    }
  }

  // Pad estimate by 4/3 to be conservative since we're approximating
  return Math.ceil(totalTokens * (4 / 3));
}

export type MicrocompactResult = {
  messages: Message[];
};

/**
 * Walk messages and collect tool_use IDs whose tool name is in
 * COMPACTABLE_TOOLS, in encounter order. Shared by both microcompact paths.
 */
function collectCompactableToolIds(messages: Message[]): string[] {
  const ids: string[] = [];
  for (const message of messages) {
    if (message.type === 'assistant' && Array.isArray(message.message.content)) {
      for (const block of message.message.content) {
        if (block.type === 'tool_use' && COMPACTABLE_TOOLS.has(block.name)) {
          ids.push(block.id);
        }
      }
    }
  }
  return ids;
}

// Prefix-match because promptCategory.ts sets the querySource to
// 'repl_main_thread:outputStyle:<style>' when a non-default output style
// is active. The bare 'repl_main_thread' is only used for the default style.
// query.ts:350/1451 use the same startsWith pattern; the pre-existing
// cached-MC `=== 'repl_main_thread'` check was a latent bug — users with a
// non-default output style were silently excluded from cached MC.
function isMainThreadSource(querySource: QuerySource | undefined): boolean {
  return !querySource || querySource.startsWith('repl_main_thread');
}

export async function microcompactMessages(
  messages: Message[],
  toolUseContext?: ToolUseContext,
  querySource?: QuerySource,
): Promise<MicrocompactResult> {
  // Clear suppression flag at start of new microcompact attempt
  clearCompactWarningSuppression();

  // Time-based trigger runs first and short-circuits. If the gap since the
  // last assistant message exceeds the threshold, the server cache has expired
  // and the full prefix will be rewritten regardless — so content-clear old
  // tool results now, before the request, to shrink what gets rewritten.
  // Cached MC (cache-editing) is skipped when this fires: editing assumes a
  // warm cache, and we just established it's cold.
  const timeBasedResult = maybeTimeBasedMicrocompact(messages, querySource);
  if (timeBasedResult) {
    return timeBasedResult;
  }

  const duplicateResult = maybeDuplicateToolResultMicrocompact(messages, querySource);
  if (duplicateResult) {
    return duplicateResult;
  }

  // No further compaction paths in external builds — autocompact handles
  // context pressure instead.
  return { messages };
}

/**
 * Time-based microcompact: when the gap since the last main-loop assistant
 * message exceeds the configured threshold, content-clear all but the most
 * recent N compactable tool results.
 *
 * Returns null when the trigger doesn't fire (disabled, wrong source, gap
 * under threshold, nothing to clear) — caller falls through to other paths.
 *
 * Unlike cached MC, this mutates message content directly. The cache is cold,
 * so there's no cached prefix to preserve via cache_edits.
 */
/**
 * Check whether the time-based trigger should fire for this request.
 *
 * Returns the measured gap (minutes since last assistant message) when the
 * trigger fires, or null when it doesn't (disabled, wrong source, under
 * threshold, no prior assistant, unparseable timestamp).
 *
 * Extracted so other pre-request paths (e.g. snip force-apply) can consult
 * the same predicate without coupling to the tool-result clearing action.
 */
export function evaluateTimeBasedTrigger(
  messages: Message[],
  querySource: QuerySource | undefined,
): { gapMinutes: number; config: TimeBasedMCConfig } | null {
  const config = getTimeBasedMCConfig();
  // Require an explicit main-thread querySource. isMainThreadSource treats
  // undefined as main-thread (for cached-MC backward-compat), but several
  // callers (/context, /compact, analyzeContext) invoke microcompactMessages
  // without a source for analysis-only purposes — they should not trigger.
  if (!config.enabled || !querySource || !isMainThreadSource(querySource)) {
    return null;
  }
  const lastAssistant = messages.findLast(m => m.type === 'assistant');
  if (!lastAssistant) {
    return null;
  }
  const gapMinutes = (Date.now() - new Date(lastAssistant.timestamp).getTime()) / 60_000;
  if (!Number.isFinite(gapMinutes) || gapMinutes < config.gapThresholdMinutes) {
    return null;
  }
  return { gapMinutes, config };
}

function maybeTimeBasedMicrocompact(
  messages: Message[],
  querySource: QuerySource | undefined,
): MicrocompactResult | null {
  const trigger = evaluateTimeBasedTrigger(messages, querySource);
  if (!trigger) {
    return null;
  }
  const { gapMinutes, config } = trigger;

  const compactableIds = collectCompactableToolIds(messages);

  // Floor at 1: slice(-0) returns the full array (paradoxically keeps
  // everything), and clearing ALL results leaves the model with zero working
  // context. Neither degenerate is sensible — always keep at least the last.
  const keepRecent = Math.max(1, config.keepRecent);
  const keepSet = new Set(compactableIds.slice(-keepRecent));
  const clearSet = new Set(compactableIds.filter(id => !keepSet.has(id)));

  if (clearSet.size === 0) {
    return null;
  }

  let tokensSaved = 0;
  const result: Message[] = messages.map(message => {
    if (message.type !== 'user' || !Array.isArray(message.message.content)) {
      return message;
    }
    let touched = false;
    const newContent = message.message.content.map(block => {
      if (
        block.type === 'tool_result' &&
        clearSet.has(block.tool_use_id) &&
        block.content !== TIME_BASED_MC_CLEARED_MESSAGE
      ) {
        tokensSaved += calculateToolResultTokens(block);
        touched = true;
        return { ...block, content: TIME_BASED_MC_CLEARED_MESSAGE };
      }
      return block;
    });
    if (!touched) return message;
    return {
      ...message,
      message: { ...message.message, content: newContent },
    };
  });

  if (tokensSaved === 0) {
    return null;
  }

  logEvent('tengu_time_based_microcompact', {
    gapMinutes: Math.round(gapMinutes),
    gapThresholdMinutes: config.gapThresholdMinutes,
    toolsCleared: clearSet.size,
    toolsKept: keepSet.size,
    keepRecent: config.keepRecent,
    tokensSaved,
  });

  logForDebugging(
    `[TIME-BASED MC] gap ${Math.round(gapMinutes)}min > ${config.gapThresholdMinutes}min, cleared ${clearSet.size} tool results (~${tokensSaved} tokens), kept last ${keepSet.size}`,
  );

  suppressCompactWarning();
  // We just changed the prompt content — the next response's cache read will
  // be low, but that's us, not a break. Tell the detector to expect a drop.
  // notifyCacheDeletion (not notifyCompaction) because it's already imported
  // here and achieves the same false-positive suppression — adding the second
  // symbol to the import was flagged by the circular-deps check.
  // Pass the actual querySource: getTrackingKey returns the full source string
  // (e.g. 'repl_main_thread:outputStyle:custom'), not just the prefix.
  if (feature('PROMPT_CACHE_BREAK_DETECTION') && querySource) {
    notifyCacheDeletion(querySource);
  }

  return { messages: result };
}

function stableStringify(value: unknown): string {
  if (value === undefined) {
    return 'undefined';
  }
  if (value === null || typeof value !== 'object') {
    return jsonStringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map(key => `${jsonStringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}

function getDuplicateCompactSignature(toolName: string, input: unknown): string | null {
  if (!DUPLICATE_COMPACTABLE_TOOLS.has(toolName)) {
    return null;
  }
  return `${toolName}:${stableStringify(input ?? {})}`;
}

function collectDuplicateToolUseState(messages: Message[]): {
  signatureByToolUseId: Map<string, string>;
  latestToolUseIdBySignature: Map<string, string>;
} {
  const signatureByToolUseId = new Map<string, string>();
  const latestToolUseIdBySignature = new Map<string, string>();

  for (const message of messages) {
    if (message.type !== 'assistant' || !Array.isArray(message.message.content)) {
      continue;
    }
    for (const block of message.message.content) {
      if (block.type !== 'tool_use') {
        continue;
      }
      const signature = getDuplicateCompactSignature(block.name, block.input);
      if (!signature) {
        continue;
      }
      signatureByToolUseId.set(block.id, signature);
      latestToolUseIdBySignature.set(signature, block.id);
    }
  }

  return { signatureByToolUseId, latestToolUseIdBySignature };
}

function isDuplicateClearedContent(content: ToolResultBlockParam['content']): boolean {
  return content === TIME_BASED_MC_CLEARED_MESSAGE || content === DUPLICATE_TOOL_RESULT_CLEARED_MESSAGE;
}

export function maybeDuplicateToolResultMicrocompact(
  messages: Message[],
  querySource: QuerySource | undefined,
): MicrocompactResult | null {
  const enabled = getFeatureValue_CACHED_MAY_BE_STALE('tengu_duplicate_tool_microcompact', true);
  if (!enabled || !querySource || !isMainThreadSource(querySource)) {
    return null;
  }

  const { signatureByToolUseId, latestToolUseIdBySignature } = collectDuplicateToolUseState(messages);
  if (signatureByToolUseId.size === latestToolUseIdBySignature.size) {
    return null;
  }

  let toolsCleared = 0;
  let tokensSaved = 0;

  const result: Message[] = messages.map(message => {
    if (message.type !== 'user' || !Array.isArray(message.message.content)) {
      return message;
    }

    let touched = false;
    const content = message.message.content.map(block => {
      if (block.type !== 'tool_result' || isDuplicateClearedContent(block.content)) {
        return block;
      }

      const signature = signatureByToolUseId.get(block.tool_use_id);
      if (!signature || latestToolUseIdBySignature.get(signature) === block.tool_use_id) {
        return block;
      }

      const tokenEstimate = calculateToolResultTokens(block);
      const charEstimate =
        typeof block.content === 'string' ? block.content.length : jsonStringify(block.content).length;
      if (charEstimate < DUPLICATE_TOOL_RESULT_MIN_CHARS) {
        return block;
      }

      touched = true;
      toolsCleared++;
      tokensSaved += tokenEstimate;
      return { ...block, content: DUPLICATE_TOOL_RESULT_CLEARED_MESSAGE };
    });

    if (!touched) {
      return message;
    }

    return {
      ...message,
      message: { ...message.message, content },
    };
  });

  if (toolsCleared === 0 || tokensSaved === 0) {
    return null;
  }

  logEvent('tengu_duplicate_tool_microcompact', {
    toolsCleared,
    tokensSaved,
  });
  logForDebugging(
    `[DUPLICATE MC] cleared ${toolsCleared} duplicate tool results (~${tokensSaved} tokens), kept latest identical results`,
  );

  suppressCompactWarning();
  if (feature('PROMPT_CACHE_BREAK_DETECTION')) {
    notifyCacheDeletion(querySource);
  }

  return { messages: result };
}
