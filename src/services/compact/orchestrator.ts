import type { QuerySource } from '../../constants/querySource.js';
import type { ToolUseContext } from '../../Tool.js';
import type { Message } from '../../types/message.js';
import type { CacheSafeParams } from '../../utils/forkedAgent.js';
import { tokenCountWithEstimation } from '../../utils/tokens.js';
import type { AutoCompactTrackingState } from './autoCompact.js';
import { autoCompactIfNeeded, getAutoCompactThreshold, isAutoCompactEnabled } from './autoCompact.js';
import type { CompactionResult } from './compact.js';
import { microcompactMessages } from './microCompact.js';
import { shouldUseSessionMemoryCompaction } from './sessionMemoryCompact.js';

export type CompactionStrategy = 'none' | 'micro' | 'session-memory' | 'auto';

export interface CompactionPipelineResult {
  wasCompacted: boolean;
  compactionResult?: CompactionResult;
  consecutiveFailures?: number;
  strategyUsed: CompactionStrategy;
  messages: Message[];
}

/**
 * Determines which compaction strategy is appropriate based on the token count and other heuristics.
 */
export function getCompactionStrategy(messages: Message[], model: string, snipTokensFreed = 0): CompactionStrategy {
  const tokenCount = tokenCountWithEstimation(messages) - snipTokensFreed;
  const autoCompactThreshold = getAutoCompactThreshold(model);

  // If token count is above the auto-compact threshold, determine if we can use session-memory or must fall back to auto
  if (isAutoCompactEnabled() && tokenCount >= autoCompactThreshold) {
    if (shouldUseSessionMemoryCompaction()) {
      return 'session-memory';
    }
    return 'auto';
  }

  // Micro-compaction runs on every turn and checks its own internal criteria (like time-based or cached MC).
  return 'micro';
}

/**
 * Runs the compaction strategies in order: micro -> session memory -> auto.
 */
export async function runCompactionPipeline(
  messages: Message[],
  toolUseContext: ToolUseContext,
  cacheSafeParams: CacheSafeParams,
  querySource?: QuerySource,
  tracking?: AutoCompactTrackingState,
  snipTokensFreed?: number,
): Promise<CompactionPipelineResult> {
  // 1. Run micro-compaction first
  const microResult = await microcompactMessages(messages, toolUseContext, querySource);
  const currentMessages = microResult.messages;

  // Determine current strategy based on token count
  const model = toolUseContext.options.mainLoopModel;
  const strategy = getCompactionStrategy(currentMessages, model, snipTokensFreed);

  if (strategy === 'session-memory' || strategy === 'auto') {
    // Both session-memory and auto-compaction are managed within autoCompactIfNeeded
    const autoResult = await autoCompactIfNeeded(
      currentMessages,
      toolUseContext,
      cacheSafeParams,
      querySource,
      tracking,
      snipTokensFreed,
    );

    if (autoResult.wasCompacted && autoResult.compactionResult) {
      // Rebuild messages using buildPostCompactMessages
      const { buildPostCompactMessages } = await import('./compact.js');
      const compactedMessages = buildPostCompactMessages(autoResult.compactionResult);
      return {
        wasCompacted: true,
        compactionResult: autoResult.compactionResult,
        consecutiveFailures: autoResult.consecutiveFailures,
        strategyUsed: strategy,
        messages: compactedMessages,
      };
    }

    return {
      wasCompacted: false,
      consecutiveFailures: autoResult.consecutiveFailures,
      strategyUsed: 'none',
      messages: currentMessages,
    };
  }

  // If strategy is 'micro', we've already run it!
  const wasMicroCompacted = currentMessages !== messages; // Reference inequality means changes were made
  return {
    wasCompacted: wasMicroCompacted,
    strategyUsed: wasMicroCompacted ? 'micro' : 'none',
    messages: currentMessages,
  };
}

export type { AutoCompactTrackingState } from './autoCompact.js';
// Re-exports of relevant types
export type { CompactionResult } from './compact.js';
