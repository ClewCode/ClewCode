/**
 * `stale-tool` — evicts the bodies of old tool results, keeping the most
 * recent ones intact. Subsumes both legacy time-based microcompact and the
 * per-message tool-result budget.
 *
 * The important departure from the legacy version: the time gap is no longer a
 * *gate*. Under the old design a session could sit far above the compact
 * threshold with megabytes of stale Read output and this mechanism would
 * decline to act because the user hadn't been away for 20 minutes — so the
 * only remaining option was a full LLM summarization of the whole session.
 * Here the planner decides *whether* to reduce; this reducer only decides
 * *which* blocks are the least costly to lose. A long idle gap still matters,
 * but as a reason to keep fewer recent results, not as an on/off switch.
 */
import type { Message } from '../../../../types/message.js';
import { collectCompactableToolIds, evaluateTimeBasedTrigger } from '../../microCompact.js';
import type { ReduceContext, Reducer } from '../types.js';
import { estimateSelection, evictSelectedToolResults, labelForToolUse } from './evictToolResults.js';

/** Recent compactable results always kept — the model is likely still using them. */
export const KEEP_RECENT_DEFAULT = 6;
/** After a long idle gap the server cache is cold anyway, so keep less. */
export const KEEP_RECENT_COLD_CACHE = 3;

function keepRecentFor(ctx: ReduceContext): number {
  const trigger = evaluateTimeBasedTrigger(ctx.messages, ctx.querySource);
  if (!trigger) return KEEP_RECENT_DEFAULT;
  return Math.max(1, Math.min(KEEP_RECENT_COLD_CACHE, trigger.config.keepRecent));
}

function selectStale(messages: Message[], keepRecent: number): Map<string, string> {
  const compactableIds = collectCompactableToolIds(messages);
  // slice(-0) returns the whole array, which would paradoxically keep
  // everything; and keeping zero leaves the model no working context.
  const keep = new Set(compactableIds.slice(-Math.max(1, keepRecent)));

  const labels = new Map<string, string>();
  for (const message of messages) {
    if (message.type !== 'assistant' || !Array.isArray(message.message.content)) continue;
    for (const block of message.message.content) {
      if (block.type === 'tool_use') {
        labels.set(block.id, labelForToolUse(block.name, block.input));
      }
    }
  }

  const targets = new Map<string, string>();
  for (const id of compactableIds) {
    if (keep.has(id)) continue;
    targets.set(id, labels.get(id) ?? 'tool result');
  }
  return targets;
}

export const staleToolReducer: Reducer = {
  name: 'stale-tool',
  loss: 0.2,
  costly: false,
  estimate(ctx: ReduceContext) {
    return estimateSelection(ctx.messages, selectStale(ctx.messages, keepRecentFor(ctx)));
  },
  async apply(ctx: ReduceContext) {
    const targets = selectStale(ctx.messages, keepRecentFor(ctx));
    return evictSelectedToolResults(ctx, { targets }, 'stale-tool');
  },
};
