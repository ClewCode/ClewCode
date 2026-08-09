/**
 * Shared machinery for the two cheapest reducers.
 *
 * `dedupe` and `stale-tool` do the same physical thing — replace the body of
 * selected tool_result blocks — and differ only in which blocks they select.
 * Keeping the rewrite in one place means the eviction bookkeeping, the token
 * accounting and the cache-break notification are all written once.
 */
import { feature } from 'bun:bundle';
import type { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/index.mjs';
import type { Message } from '../../../../types/message.js';
import { jsonStringify } from '../../../../utils/slowOperations.js';
import { notifyCacheDeletion } from '../../../api/promptCacheBreakDetection.js';
import {
  calculateToolResultTokens,
  DUPLICATE_TOOL_RESULT_CLEARED_MESSAGE,
  TIME_BASED_MC_CLEARED_MESSAGE,
} from '../../microCompact.js';
import type { EvictionRecord } from '../evictionStore.js';
import { evictionStub } from '../evictionStore.js';
import type { ReduceContext, ReduceOutcome, ReducerName } from '../types.js';

/** Human-readable label for an eviction, derived from the tool call. */
export function labelForToolUse(name: string, input: unknown): string {
  const record = (input ?? {}) as Record<string, unknown>;
  const key = record.file_path ?? record.pattern ?? record.command ?? record.url;
  return key ? `${name}: ${String(key).slice(0, 80)}` : name;
}

function contentToString(content: ToolResultBlockParam['content']): string {
  return typeof content === 'string' ? content : jsonStringify(content ?? '');
}

/**
 * True for content this system (or the legacy microcompact path) already
 * replaced. Both paths can run in the same session during the migration, so
 * both markers are recognized.
 */
export function isAlreadyEvicted(raw: string): boolean {
  return (
    raw.startsWith('[evicted:') ||
    raw === TIME_BASED_MC_CLEARED_MESSAGE ||
    raw === DUPLICATE_TOOL_RESULT_CLEARED_MESSAGE
  );
}

export interface EvictionSelection {
  /** tool_use_id → label, for every block whose content should be evicted. */
  targets: Map<string, string>;
}

/**
 * Replace the content of every selected tool_result with a restore stub,
 * recording the original in the eviction store.
 *
 * Stops once `ctx.target` tokens have been freed — the planner asked for a
 * specific amount, and evicting past it is gratuitous damage. Blocks are
 * processed oldest-first, so what survives is always the most recent context.
 */
export function evictSelectedToolResults(
  ctx: ReduceContext,
  selection: EvictionSelection,
  reducer: ReducerName,
): ReduceOutcome {
  const { targets } = selection;
  if (targets.size === 0) {
    return { messages: ctx.messages, tokensFreed: 0, evicted: [] };
  }

  const evicted: EvictionRecord[] = [];
  let tokensFreed = 0;

  const messages = ctx.messages.map(message => {
    if (message.type !== 'user' || !Array.isArray(message.message.content)) {
      return message;
    }
    let touched = false;
    const content = message.message.content.map(block => {
      if (block.type !== 'tool_result') return block;
      if (tokensFreed >= ctx.target) return block;
      const label = targets.get(block.tool_use_id);
      if (label === undefined) return block;

      const raw = contentToString(block.content);
      // Already a stub (or a legacy cleared marker) — re-evicting would park a
      // pointer to a pointer and report a bogus reclaim.
      if (!raw || isAlreadyEvicted(raw)) return block;
      const tokens = calculateToolResultTokens(block);
      if (tokens <= 0) return block;

      const record = ctx.state.evictions.put(
        { kind: 'tool_result', label, tokens, reducer, turn: ctx.state.turn },
        raw,
      );
      evicted.push(record);
      // The stub itself costs a few tokens; charging them keeps the ledger
      // honest rather than over-reporting the reclaim.
      const stub = evictionStub(record);
      tokensFreed += Math.max(0, tokens - Math.ceil(stub.length / 4));
      touched = true;
      return { ...block, content: stub };
    });

    return touched ? { ...message, message: { ...message.message, content } } : message;
  });

  if (evicted.length === 0) {
    return { messages: ctx.messages, tokensFreed: 0, evicted: [] };
  }

  // We just rewrote prompt content — the next response's cache read will drop.
  // Telling the detector up front keeps it from reporting our own edit as a break.
  if (feature('PROMPT_CACHE_BREAK_DETECTION') && ctx.querySource) {
    notifyCacheDeletion(ctx.querySource);
  }

  return { messages, tokensFreed, evicted };
}

/** Sum of what evicting every selected block would free, without doing it. */
export function estimateSelection(messages: Message[], targets: Map<string, string>): number {
  let total = 0;
  for (const message of messages) {
    if (message.type !== 'user' || !Array.isArray(message.message.content)) continue;
    for (const block of message.message.content) {
      if (block.type === 'tool_result' && targets.has(block.tool_use_id)) {
        total += calculateToolResultTokens(block);
      }
    }
  }
  return total;
}
