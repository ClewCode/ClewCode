/**
 * Auto-compact v2 — the single entry point.
 *
 * query.ts calls this once per turn. Everything the legacy path spread across
 * six call sites (tool-result budget, snip, two microcompact variants, session
 * memory, full compact) and three threshold families now happens behind one
 * function that answers one question: given the pressure, what is the least
 * damaging way to fit?
 */
import type { QuerySource } from '../../../constants/querySource.js';
import type { ToolUseContext } from '../../../Tool.js';
import type { Message } from '../../../types/message.js';
import { isEnvTruthy } from '../../../utils/envUtils.js';
import type { CacheSafeParams } from '../../../utils/forkedAgent.js';
import { logError } from '../../../utils/log.js';
import { isAtNaturalBoundary, isAutoCompactEnabled, resolveAdaptiveBuffer } from '../autoCompact.js';
import { createEvictionStore, createMemoryEvictionStore, type EvictionRecord } from './evictionStore.js';
import { EMPTY_HEALTH, recordCompaction } from './health.js';
import { type ContextLedger, createContextLedger, pressureLevel } from './ledger.js';
import { applyPlan, type CompactPlan, planCompaction } from './planner.js';
import type { CompactSessionState, ReduceContext, Reducer, ReducerName } from './types.js';

export interface RunCompactionOptions {
  querySource?: QuerySource;
  toolUseContext?: ToolUseContext;
  cacheSafeParams?: CacheSafeParams;
  /** Overrides boundary detection; omit to derive from the message tail. */
  atBoundary?: boolean;
  /** Manual compact instructions from `/compact`. Only the summarize reducer uses it. */
  customInstructions?: string;
  /** Force compaction even if under natural threshold (for manual /compact). */
  force?: boolean;
  /** Explicit manual invocation. */
  manual?: boolean;
}

export interface RunCompactionResult {
  messages: Message[];
  wasCompacted: boolean;
  tokensFreed: number;
  applied: ReducerName[];
  evicted: EvictionRecord[];
  /** Markers to yield into the transcript. */
  boundaries: Message[];
  plan: CompactPlan;
  /**
   * The planner could not free what it needed. This is the only path from v2
   * to a prompt_too_long, so callers should surface it rather than swallow it.
   */
  shortfall: boolean;
}

/**
 * Per-session compaction state. Held by the caller (in practice, threaded
 * through ToolUseContext) rather than in module scope — the legacy globals
 * `regretState` and `backgroundAutoCompactJob` were shared across concurrently
 * running agents and leaked between test files.
 */
export function createCompactSessionState(agentId?: CompactSessionState['agentId']): CompactSessionState {
  let evictions: CompactSessionState['evictions'];
  try {
    evictions = createEvictionStore();
  } catch (err) {
    // No writable session dir (forked agents, some sandboxes). Restores still
    // work within the process; only cross-session recovery is lost.
    logError(err);
    evictions = createMemoryEvictionStore();
  }
  return { agentId, turn: 0, failures: 0, evictions, restoredThisTurn: 0, health: { ...EMPTY_HEALTH } };
}

const ledgers = new WeakMap<CompactSessionState, ContextLedger>();

function ledgerFor(state: CompactSessionState): ContextLedger {
  let ledger = ledgers.get(state);
  if (!ledger) {
    ledger = createContextLedger();
    ledgers.set(state, ledger);
  }
  return ledger;
}

/**
 * Reduce the conversation to fit, doing the least damage that suffices.
 *
 * Returns the input unchanged when there is no deficit — the common case, and
 * the reason `estimate()` on every reducer must stay cheap.
 */
export async function runCompaction(
  messages: Message[],
  state: CompactSessionState,
  model: string,
  opts: RunCompactionOptions = {},
): Promise<RunCompactionResult> {
  const empty: RunCompactionResult = {
    messages,
    wasCompacted: false,
    tokensFreed: 0,
    applied: [],
    evicted: [],
    boundaries: [],
    plan: { steps: [], expectedYield: 0, deficit: 0, rationale: 'disabled' },
    shortfall: false,
  };

  if (isEnvTruthy(process.env.DISABLE_COMPACT) || !isAutoCompactEnabled()) {
    return empty;
  }
  // Forked summarization agents must never recurse into compaction.
  if (opts.querySource === 'session_memory' || opts.querySource === 'compact_summarize') {
    return empty;
  }

  state.turn++;
  state.restoredThisTurn = 0;

  const isForced = opts.force || opts.manual || Boolean(opts.customInstructions);
  const ledger = ledgerFor(state);
  const pressure = ledger.measure(messages, model, resolveAdaptiveBuffer(messages));
  const level = pressureLevel(pressure);

  if (level === 'none' && !isForced) {
    return { ...empty, plan: { steps: [], expectedYield: 0, deficit: 0, rationale: 'under threshold' } };
  }

  const atBoundary = opts.atBoundary ?? isAtNaturalBoundary(messages);
  // Mid-tool-chain, an LLM summarization would summarize away a tool_use whose
  // tool_result has not arrived — the classic "forgot what it was doing" bug.
  // Cheap reducers are still safe there, and often enough on their own; only a
  // force-level deficit justifies summarizing mid-chain.
  const allowCostly = atBoundary || level === 'force' || isForced;

  const makeContext = (_reducer: Reducer, target: number, msgs: Message[] = messages): ReduceContext => ({
    messages: msgs,
    model,
    pressure,
    target,
    querySource: opts.querySource,
    toolUseContext: opts.toolUseContext,
    cacheSafeParams: opts.cacheSafeParams,
    state,
    atBoundary,
    customInstructions: opts.customInstructions,
  });

  const plan = planCompaction(pressure, (r, t) => makeContext(r, t), {
    atBoundary,
    allowCostly,
    forceSummarize: isForced && Boolean(opts.customInstructions),
  });
  if (plan.steps.length === 0) {
    return { ...empty, plan };
  }

  try {
    const result = await applyPlan(plan, messages, makeContext);
    ledger.applyDelta(result.tokensFreed);
    state.failures = 0;
    // Record before returning: a shortfall is the only route from v2 to a
    // prompt_too_long, and it needs to reach the user rather than only
    // analytics. See health.ts.
    recordCompaction(
      {
        applied: result.applied,
        tokensFreed: result.tokensFreed,
        deficit: plan.deficit,
        shortfall: result.shortfall,
        rationale: plan.rationale,
      },
      state,
    );
    return {
      messages: result.messages,
      wasCompacted: result.tokensFreed > 0,
      tokensFreed: result.tokensFreed,
      applied: result.applied,
      evicted: result.evicted,
      boundaries: result.boundaries,
      plan,
      shortfall: result.shortfall,
    };
  } catch (err) {
    logError(err);
    state.failures++;
    return { ...empty, plan };
  }
}

export { isCompactV2Enabled } from './enabled.js';
export { createEvictionStore, createMemoryEvictionStore } from './evictionStore.js';
export { compactHealthLine, getCompactHealth, recordRestore, shortfallWarning } from './health.js';
export type { ContextPressure } from './ledger.js';
export { type ContextLimits, computeLimits } from './limits.js';
export type { CompactSessionState } from './types.js';
