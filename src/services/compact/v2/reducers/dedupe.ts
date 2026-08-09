/**
 * `dedupe` — the cheapest reducer. Evicts tool_results that a later, identical
 * tool call already superseded (same tool, same input). Losing them costs
 * nothing: the current answer to the same question is still in context.
 *
 * Selection logic mirrors maybeDuplicateToolResultMicrocompact so behavior is
 * unchanged from the legacy path; only the disposal differs — the old content
 * is now recoverable instead of being overwritten with a fixed string.
 */
import type { Message } from '../../../../types/message.js';
import { jsonStringify } from '../../../../utils/slowOperations.js';
import { collectDuplicateToolUseState, isDuplicateClearedContent } from '../../microCompact.js';
import type { ReduceContext, Reducer } from '../types.js';
import { estimateSelection, evictSelectedToolResults, labelForToolUse } from './evictToolResults.js';

/** Superseded results below this size aren't worth a stub + a handle. */
const MIN_CHARS = 800;

function selectDuplicates(messages: Message[]): Map<string, string> {
  const { signatureByToolUseId, latestToolUseIdBySignature } = collectDuplicateToolUseState(messages);
  const targets = new Map<string, string>();
  if (signatureByToolUseId.size === latestToolUseIdBySignature.size) {
    return targets;
  }

  const labels = new Map<string, string>();
  for (const message of messages) {
    if (message.type !== 'assistant' || !Array.isArray(message.message.content)) continue;
    for (const block of message.message.content) {
      if (block.type === 'tool_use') {
        labels.set(block.id, labelForToolUse(block.name, block.input));
      }
    }
  }

  for (const message of messages) {
    if (message.type !== 'user' || !Array.isArray(message.message.content)) continue;
    for (const block of message.message.content) {
      if (block.type !== 'tool_result' || isDuplicateClearedContent(block.content)) continue;
      const signature = signatureByToolUseId.get(block.tool_use_id);
      // Keep the newest result for each signature — that one is still true.
      if (!signature || latestToolUseIdBySignature.get(signature) === block.tool_use_id) continue;
      const chars =
        typeof block.content === 'string' ? block.content.length : jsonStringify(block.content ?? '').length;
      if (chars < MIN_CHARS) continue;
      targets.set(block.tool_use_id, labels.get(block.tool_use_id) ?? 'superseded tool result');
    }
  }
  return targets;
}

export const dedupeReducer: Reducer = {
  name: 'dedupe',
  loss: 0.05,
  costly: false,
  estimate(ctx: ReduceContext) {
    return estimateSelection(ctx.messages, selectDuplicates(ctx.messages));
  },
  async apply(ctx: ReduceContext) {
    return evictSelectedToolResults(ctx, { targets: selectDuplicates(ctx.messages) }, 'dedupe');
  },
};
