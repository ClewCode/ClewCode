/**
 * `snip` — removes whole message ranges from history rather than clearing
 * individual tool results.
 *
 * The runtime behind this is currently inert: src/services/compact/snipCompact.ts
 * ships safe no-op stubs because the modules the HISTORY_SNIP feature was
 * written against were never committed. The reducer is wired up anyway so that
 * when that runtime returns it participates in planning automatically instead
 * of needing another bespoke call site in query.ts — which is the whole point
 * of the Reducer interface.
 */
import { feature } from 'bun:bundle';
import { isSnipRuntimeEnabled, snipCompactIfNeeded } from '../../snipCompact.js';
import { emptyOutcome, type ReduceContext, type Reducer } from '../types.js';

// `feature()` from bun:bundle must appear directly in an if/ternary so the
// bundler can strip the branch — it cannot be assigned or combined first.
function available(): boolean {
  if (feature('HISTORY_SNIP')) {
    return isSnipRuntimeEnabled();
  }
  return false;
}

export const snipReducer: Reducer = {
  name: 'snip',
  loss: 0.35,
  costly: false,
  estimate(ctx: ReduceContext) {
    if (!available()) return 0;
    // The stub runtime reports nothing it would free; a real implementation
    // returns its projected saving here without mutating anything.
    const projected = snipCompactIfNeeded(ctx.messages) as { tokensFreed?: number };
    return projected.tokensFreed ?? 0;
  },
  async apply(ctx: ReduceContext) {
    if (!available()) return emptyOutcome(ctx.messages);
    const result = snipCompactIfNeeded(ctx.messages) as {
      messages: typeof ctx.messages;
      tokensFreed?: number;
      boundaryMessage?: (typeof ctx.messages)[number];
    };
    return {
      messages: result.messages,
      tokensFreed: result.tokensFreed ?? 0,
      evicted: [],
      boundary: result.boundaryMessage,
    };
  },
};
