/**
 * `drop` — the last resort, and the reducer the legacy system did not have.
 *
 * Previously, when compaction failed three times in a row a circuit breaker
 * gave up and let the request go to the API anyway, which answered
 * `prompt_too_long` and effectively ended the session. Because eviction is now
 * recoverable, there is a better final move: cut the oldest history away, park
 * it on disk, and keep going. It is lossy and it is meant to be — but it
 * always succeeds, which is what makes `prompt_too_long` unreachable.
 */
import type { Message } from '../../../../types/message.js';
import { jsonStringify } from '../../../../utils/slowOperations.js';
import { estimateMessageTokens } from '../../microCompact.js';
import { evictionStub } from '../evictionStore.js';
import { emptyOutcome, type ReduceContext, type Reducer } from '../types.js';

/** Never drop into the live tail — the model needs its current working set. */
const PROTECTED_TAIL = 8;

/**
 * A message index safe to cut *before*: a user message that is not a
 * tool_result. Cutting anywhere else can strand a tool_result whose tool_use
 * was dropped, which the API rejects outright.
 */
function isSafeCutPoint(message: Message | undefined): boolean {
  if (message?.type !== 'user') return false;
  const content = message.message?.content;
  if (!Array.isArray(content)) return true;
  return !content.some(block => block.type === 'tool_result');
}

/**
 * Largest safe cut index whose prefix frees at least `target` tokens, or the
 * largest available one when nothing reaches the target.
 */
function findCutIndex(messages: Message[], target: number): number {
  const ceiling = Math.max(0, messages.length - PROTECTED_TAIL);
  let best = 0;
  for (let i = 1; i < ceiling; i++) {
    if (!isSafeCutPoint(messages[i])) continue;
    best = i;
    if (estimateMessageTokens(messages.slice(0, i)) >= target) break;
  }
  return best;
}

function describe(messages: Message[]): string {
  return `${messages.length} messages of earlier conversation`;
}

export const dropReducer: Reducer = {
  name: 'drop',
  loss: 0.95,
  costly: false,
  estimate(ctx: ReduceContext) {
    const cut = findCutIndex(ctx.messages, ctx.target);
    return cut === 0 ? 0 : estimateMessageTokens(ctx.messages.slice(0, cut));
  },
  async apply(ctx: ReduceContext) {
    const cut = findCutIndex(ctx.messages, ctx.target);
    if (cut === 0) return emptyOutcome(ctx.messages);

    const removed = ctx.messages.slice(0, cut);
    const tokens = estimateMessageTokens(removed);
    const record = ctx.state.evictions.put(
      { kind: 'message_range', label: describe(removed), tokens, reducer: 'drop', turn: ctx.state.turn },
      jsonStringify(removed),
    );

    // The planner surfaces `evicted` to the model as a restore note, so the
    // cut is visible rather than a silent hole in the conversation.
    return {
      messages: ctx.messages.slice(cut),
      tokensFreed: tokens,
      evicted: [record],
    };
  },
};

/** Text the planner injects after a drop, so the model knows what happened. */
export function dropNotice(records: { handle: string; label: string; tokens: number }[]): string {
  const stubs = records.map(r => evictionStub(r as Parameters<typeof evictionStub>[0]));
  return `Earlier conversation was removed to fit the context window.\n${stubs.join('\n')}`;
}
