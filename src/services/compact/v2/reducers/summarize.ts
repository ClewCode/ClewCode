/**
 * `summarize` — the expensive reducer: an LLM rewrites the conversation into a
 * summary. This is the mechanism the legacy system reached for *first*, and
 * the reason so many sessions lost detail they still needed.
 *
 * Nothing about the summarization itself changes here — compactConversation
 * and its prompt engineering are the most valuable part of the old system and
 * are carried over intact. What changes is when it runs: the planner only
 * selects it once every cheaper reducer has been spent and the deficit still
 * is not covered.
 */
import { markPostCompaction } from '../../../../bootstrap/state.js';
import { autoExtractFromSession } from '../../../../memory/compacter.js';
import { logError } from '../../../../utils/log.js';
import { notifyCompaction } from '../../../api/promptCacheBreakDetection.js';
import { setLastSummarizedMessageId } from '../../../SessionMemory/sessionMemoryUtils.js';
import { buildPostCompactMessages, type CompactionResult, compactConversation } from '../../compact.js';
import { estimateMessageTokens } from '../../microCompact.js';
import { runPostCompactCleanup } from '../../postCompactCleanup.js';
import { getLastRawCompactResponse, parseCompactMemories } from '../../prompt.js';
import { trySessionMemoryCompaction } from '../../sessionMemoryCompact.js';
import { emptyOutcome, type ReduceContext, type Reducer } from '../types.js';

/**
 * Fraction of current context a summarization is assumed to reclaim.
 *
 * Deliberately conservative. The planner uses estimates to decide whether the
 * cheap reducers suffice; over-promising here would make it skip them and jump
 * to summarizing, which is exactly the failure mode v2 exists to fix.
 */
const EXPECTED_RECLAIM_RATIO = 0.6;

function tokensFreedBy(result: CompactionResult, before: number, after: number): number {
  const pre = result.preCompactTokenCount;
  const post = result.postCompactTokenCount;
  if (typeof pre === 'number' && typeof post === 'number' && pre > post) {
    return pre - post;
  }
  return Math.max(0, before - after);
}

/**
 * Post-summarization bookkeeping shared by both the session-memory and the
 * full path: reset the summary anchor, run cleanup hooks, suppress the
 * cache-break false positive, and kick off best-effort memory extraction.
 */
function finalizeSummarization(ctx: ReduceContext): void {
  setLastSummarizedMessageId(undefined);
  runPostCompactCleanup(ctx.querySource);
  notifyCompaction(ctx.querySource ?? 'compact', ctx.state.agentId);
  markPostCompaction();
  const raw = getLastRawCompactResponse();
  autoExtractFromSession(raw ? parseCompactMemories(raw) : undefined).catch(err => {
    // Memory extraction must never block or fail a compaction.
    logError(err);
  });
}

export const summarizeReducer: Reducer = {
  name: 'summarize',
  loss: 0.6,
  costly: true,
  estimate(ctx: ReduceContext) {
    // Needs a real query context to fork the summarizing agent.
    if (!ctx.toolUseContext || !ctx.cacheSafeParams) return 0;
    return Math.floor(ctx.pressure.used * EXPECTED_RECLAIM_RATIO);
  },
  async apply(ctx: ReduceContext) {
    if (!ctx.toolUseContext || !ctx.cacheSafeParams) {
      return emptyOutcome(ctx.messages);
    }
    const before = estimateMessageTokens(ctx.messages);

    // Session-memory compaction keeps a live tail and is strictly less lossy,
    // so it gets first refusal — same precedence the legacy path used.
    const sessionMemoryResult = await trySessionMemoryCompaction(
      ctx.messages,
      ctx.state.agentId,
      ctx.pressure.limits.actNow,
    );
    const result =
      sessionMemoryResult ??
      (await compactConversation(
        ctx.messages,
        ctx.toolUseContext,
        ctx.cacheSafeParams,
        true, // suppress user questions — this is automatic
        undefined, // no custom instructions
        true, // isAutoCompact
        {
          isRecompactionInChain: ctx.state.turn > 0,
          turnsSincePreviousCompact: ctx.state.turn,
          autoCompactThreshold: ctx.pressure.limits.actNow,
          querySource: ctx.querySource,
        },
      ));

    finalizeSummarization(ctx);

    const messages = buildPostCompactMessages(result);
    return {
      messages,
      tokensFreed: tokensFreedBy(result, before, estimateMessageTokens(messages)),
      evicted: [],
      boundary: result.boundaryMarker,
    };
  },
};
