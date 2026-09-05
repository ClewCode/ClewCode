import { feature } from 'bun:bundle';
import { markPostCompaction } from 'src/bootstrap/state.js';
import { getSystemContext, getUserContext } from '../../context.js';
import { autoExtractFromSession } from '../../memory/compacter.js';
import { notifyCompaction } from '../../services/api/promptCacheBreakDetection.js';
import {
  type CompactionResult,
  compactConversation,
  ERROR_MESSAGE_EXTRA_USAGE_REQUIRED,
  ERROR_MESSAGE_INCOMPLETE_RESPONSE,
  ERROR_MESSAGE_NOT_ENOUGH_MESSAGES,
} from '../../services/compact/compact.js';
import { suppressCompactWarning } from '../../services/compact/compactWarningState.js';
import { microcompactMessages } from '../../services/compact/microCompact.js';
import { runPostCompactCleanup } from '../../services/compact/postCompactCleanup.js';
import { getLastRawCompactResponse, parseCompactMemories } from '../../services/compact/prompt.js';
import { createCompactSessionState, runCompaction } from '../../services/compact/v2/index.js';
import { setLastSummarizedMessageId } from '../../services/SessionMemory/sessionMemoryUtils.js';
import type { ToolUseContext } from '../../Tool.js';
import type { LocalCommandCall } from '../../types/command.js';
import type { Message, UserMessage } from '../../types/message.js';
import { hasExactErrorMessage } from '../../utils/errors.js';
import { logError } from '../../utils/log.js';
import { createCompactBoundaryMessage, getMessagesAfterCompactBoundary } from '../../utils/messages.js';
import { buildEffectiveSystemPrompt, type SystemPrompt } from '../../utils/systemPrompt.js';

export const call: LocalCommandCall = async (args, context) => {
  const { abortController } = context;
  let { messages } = context;

  // REPL keeps snipped messages for UI scrollback — project so the compact
  // model doesn't summarize content that was intentionally removed.
  messages = getMessagesAfterCompactBoundary(messages);

  if (messages.length === 0) {
    throw new Error('No messages to compact');
  }

  const customInstructions = args.trim();

  try {
    // Manual /compact routes through v2 auto-compact as the single entry point.
    // v2 supports custom instructions via the summarize reducer.
    context.onCompactProgress?.({ type: 'compact_start' });
    context.setSDKStatus?.('compacting' as any);
    try {
      const compactState = context.compactState ?? createCompactSessionState(context.agentId);
      const cacheSafeParams = await getCacheSharingParams(context, messages);
      const v2Result = await runCompaction(messages, compactState, context.options.mainLoopModel, {
        querySource: 'manual_compact',
        toolUseContext: context,
        cacheSafeParams,
        atBoundary: true,
        customInstructions,
        force: true,
        manual: true,
      });

      if (v2Result.wasCompacted) {
        (getUserContext as any).cache.clear?.();
        runPostCompactCleanup();
        if (feature('PROMPT_CACHE_BREAK_DETECTION')) {
          notifyCompaction(context.options.querySource ?? 'compact', context.agentId);
        }
        markPostCompaction();
        suppressCompactWarning();

        const extractResult = await autoExtractFromSession().catch(() => null);

        const boundaryMarker =
          // @ts-expect-error - Phase3 typecheck auto (TS error suppression)
          v2Result.boundaries[0] ?? createCompactBoundaryMessage('auto', 0, messages[messages.length - 1]?.uuid ?? '');

        return {
          type: 'compact',
          compactionResult: {
            boundaryMarker: boundaryMarker as any,
            summaryMessages: v2Result.boundaries as UserMessage[],
            attachments: [],
            hookResults: [],
            messagesToKeep: v2Result.messages,
            preCompactTokenCount: 0,
            postCompactTokenCount: v2Result.tokensFreed,
            truePostCompactTokenCount: v2Result.tokensFreed,
            userDisplayMessage: undefined,
          } satisfies CompactionResult,
          displayText: buildDisplayText(context, undefined, extractResult),
        };
      }

      // If v2 didn't compact (no deficit, or below threshold), fall back to legacy
      // which runs microcompact + compactConversation unconditionally.
      // Run microcompact first to reduce tokens before summarization
      const microcompactResult = await microcompactMessages(messages, context);
      const messagesForCompact = microcompactResult.messages;

      const result = await compactConversation(
        messagesForCompact,
        context,
        await getCacheSharingParams(context, messagesForCompact),
        false,
        customInstructions,
        false,
      );

      // Reset lastSummarizedMessageId since legacy compaction replaces all messages
      // and the old message UUID will no longer exist in the new messages array
      setLastSummarizedMessageId(undefined);

      // Suppress the "Context left until auto-compact" warning after successful compaction
      suppressCompactWarning();

      (getUserContext as any).cache.clear?.();
      runPostCompactCleanup();

      // Auto-extract durable memories
      const rawResponse2 = getLastRawCompactResponse();
      const memories2 = rawResponse2 ? parseCompactMemories(rawResponse2) : undefined;
      const extractResult2 = await autoExtractFromSession(memories2).catch(() => null);

      return {
        type: 'compact',
        compactionResult: result,
        displayText: buildDisplayText(context, result.userDisplayMessage, extractResult2),
      };
    } finally {
      context.onCompactProgress?.({ type: 'compact_end' });
      context.setSDKStatus?.(null as any);
    }
  } catch (error) {
    if (abortController.signal.aborted) {
      throw new Error('Compaction canceled.');
    } else if (hasExactErrorMessage(error, ERROR_MESSAGE_NOT_ENOUGH_MESSAGES)) {
      throw new Error(ERROR_MESSAGE_NOT_ENOUGH_MESSAGES);
    } else if (hasExactErrorMessage(error, ERROR_MESSAGE_INCOMPLETE_RESPONSE)) {
      throw new Error(ERROR_MESSAGE_INCOMPLETE_RESPONSE);
    } else if (hasExactErrorMessage(error, ERROR_MESSAGE_EXTRA_USAGE_REQUIRED)) {
      throw new Error(ERROR_MESSAGE_EXTRA_USAGE_REQUIRED);
    } else {
      logError(error);
      throw new Error(`Error during compaction: ${error}`);
    }
  }
};

async function getCacheSharingParams(
  context: ToolUseContext,
  _messages: Message[],
): Promise<{
  systemPrompt: SystemPrompt;
  userContext: { [k: string]: string };
  systemContext: { [k: string]: string };
  toolUseContext: ToolUseContext;
  forkContextMessages: Message[];
}> {
  const systemPrompt = await buildEffectiveSystemPrompt({
    mainThreadAgentDefinition: undefined,
    toolUseContext: { options: context.options },
    customSystemPrompt: undefined,
    defaultSystemPrompt: [],
    appendSystemPrompt: undefined,
    overrideSystemPrompt: undefined,
  });

  const userContextObj = await getUserContext();
  const systemContextObj = await getSystemContext();

  // Convert to string-indexed objects with string values
  const userContext: { [k: string]: string } = {};
  const systemContext: { [k: string]: string } = {};

  for (const [key, value] of Object.entries(userContextObj)) {
    userContext[key] = String(value);
  }
  for (const [key, value] of Object.entries(systemContextObj)) {
    systemContext[key] = String(value);
  }

  return {
    systemPrompt,
    userContext,
    systemContext,
    toolUseContext: context,
    forkContextMessages: _messages,
  };
}

function buildDisplayText(
  _context: ToolUseContext,
  userDisplayMessage: string | undefined,
  extractResult: {
    created: number;
    updated: number;
    unchanged: number;
    entries: Array<any>;
    filesUpdated: string[];
  } | null,
): string {
  if (userDisplayMessage) {
    return userDisplayMessage;
  }

  const parts: string[] = [];
  if (extractResult) {
    const total = extractResult.created + extractResult.updated + extractResult.unchanged;
    if (total > 0) {
      parts.push(
        `Extracted ${total} memories (${extractResult.created} new, ${extractResult.updated} updated, ${extractResult.unchanged} unchanged)`,
      );
    }
  }

  const { getLastSummarizedMessageId } = require('../../services/SessionMemory/sessionMemoryUtils.js');
  const lastSummarizedId = getLastSummarizedMessageId();
  if (lastSummarizedId) {
    const msgIndex = _context.messages.findIndex((m: Message) => m.uuid === lastSummarizedId);
    if (msgIndex >= 0) {
      const remaining = _context.messages.length - msgIndex - 1;
      if (remaining > 0) {
        parts.push(`${remaining} messages since last summary`);
      }
    }
  }

  return parts.length > 0 ? parts.join(' · ') : 'Compacted';
}
