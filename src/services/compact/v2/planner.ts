/**
 * Auto-compact v2 — the planner.
 *
 * The legacy design bound each mechanism to its own threshold, so what
 * happened at a given context size was fixed in advance: cross the line, run
 * the mechanism attached to that line. A tool-heavy session with 300k of
 * re-readable file output and a chat-only session with 300k of irreplaceable
 * reasoning got the same treatment — a full LLM summarization.
 *
 * Here there is one decision: *reclaim N tokens, doing the least damage*.
 * Reducers are sorted by how much fidelity they cost and spent in that order
 * until the deficit is covered. Summarization is simply what you reach when
 * the cheap options run out — which, in a tool-heavy session, they usually
 * don't. That is the entire behavioral thesis of v2, and it is expressed in
 * about fifteen lines of `planCompaction`.
 */
import type { Message } from '../../../types/message.js';
import { logForDebugging } from '../../../utils/debug.js';
import { type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS, logEvent } from '../../analytics/index.js';
import type { EvictionRecord } from './evictionStore.js';
import type { ContextPressure } from './ledger.js';
import { dedupeReducer } from './reducers/dedupe.js';
import { dropReducer } from './reducers/drop.js';
import { scoredToolReducer } from './reducers/scoredTool.js';
import { snipReducer } from './reducers/snip.js';
import { staleToolReducer } from './reducers/staleTool.js';
import { summarizeReducer } from './reducers/summarize.js';
import type { ReduceContext, Reducer, ReducerName } from './types.js';

/** Every reducer, cheapest loss first. Order here *is* the policy. */
export const REDUCERS: Reducer[] = [
  dedupeReducer,
  staleToolReducer,
  scoredToolReducer,
  snipReducer,
  summarizeReducer,
  dropReducer,
].sort((a, b) => a.loss - b.loss);

export interface PlanStep {
  reducer: Reducer;
  /** Tokens this step is expected to contribute. */
  expected: number;
}

export interface CompactPlan {
  steps: PlanStep[];
  expectedYield: number;
  deficit: number;
  /** Why this plan — surfaced in /context and analytics. */
  rationale: string;
}

export interface PlanOptions {
  atBoundary: boolean;
  /** False mid-tool-chain or when a fork would deadlock: no LLM reducers. */
  allowCostly: boolean;
}

/**
 * Choose the cheapest set of reducers that covers the deficit.
 *
 * `drop` is only ever appended when everything else together still falls
 * short. Because drop can always free something, a returned plan whose
 * expectedYield is under the deficit means the context genuinely cannot be
 * reduced further — not that we declined to try.
 */
export function planCompaction(
  pressure: ContextPressure,
  makeContext: (reducer: Reducer, target: number) => ReduceContext,
  opts: PlanOptions,
): CompactPlan {
  const deficit = pressure.deficit;
  if (deficit <= 0) {
    return { steps: [], expectedYield: 0, deficit: 0, rationale: 'under target' };
  }

  const steps: PlanStep[] = [];
  let covered = 0;

  for (const reducer of REDUCERS) {
    if (covered >= deficit) break;
    if (reducer.costly && !opts.allowCostly) continue;
    // Drop is not part of the normal ladder — it is the fallback below.
    if (reducer.name === 'drop') continue;

    const remaining = deficit - covered;
    const expected = reducer.estimate(makeContext(reducer, remaining));
    if (expected <= 0) continue;

    steps.push({ reducer, expected: Math.min(expected, remaining) });
    covered += expected;
  }

  if (covered < deficit) {
    const remaining = deficit - covered;
    const expected = dropReducer.estimate(makeContext(dropReducer, remaining));
    if (expected > 0) {
      steps.push({ reducer: dropReducer, expected: Math.min(expected, remaining) });
      covered += expected;
    }
  }

  return {
    steps,
    expectedYield: covered,
    deficit,
    rationale: describePlan(steps, deficit, covered, opts),
  };
}

function describePlan(steps: PlanStep[], deficit: number, covered: number, opts: PlanOptions): string {
  if (steps.length === 0) {
    return opts.allowCostly ? 'nothing to reclaim' : 'deferred: mid-tool-chain, no cheap reducer applies';
  }
  const names = steps.map(s => `${s.reducer.name}(~${Math.round(s.expected / 1000)}k)`).join(' + ');
  const verdict = covered >= deficit ? 'covers' : 'short of';
  return `${names} ${verdict} ${Math.round(deficit / 1000)}k deficit`;
}

export interface ApplyResult {
  messages: Message[];
  tokensFreed: number;
  evicted: EvictionRecord[];
  boundaries: Message[];
  applied: ReducerName[];
  /** True when the plan did not reach the requested deficit. */
  shortfall: boolean;
}

/**
 * Execute a plan, stopping as soon as the deficit is covered.
 *
 * Steps are executed against the *running* message array, so each reducer sees
 * what its predecessors already did. Estimates are upper bounds, so a step can
 * yield less than planned; re-checking after every step is what lets the loop
 * stop early instead of over-reducing.
 */
export async function applyPlan(
  plan: CompactPlan,
  initialMessages: Message[],
  makeContext: (reducer: Reducer, target: number, messages: Message[]) => ReduceContext,
): Promise<ApplyResult> {
  let messages = initialMessages;
  let tokensFreed = 0;
  const evicted: EvictionRecord[] = [];
  const boundaries: Message[] = [];
  const applied: ReducerName[] = [];

  for (const [index, step] of plan.steps.entries()) {
    const remaining = plan.deficit - tokensFreed;
    // The first step always runs: a zero-deficit plan has no steps at all, so
    // reaching here means something was asked for.
    if (index > 0 && remaining <= 0) break;

    const outcome = await step.reducer.apply(makeContext(step.reducer, Math.max(remaining, 0), messages));
    if (outcome.tokensFreed <= 0 && outcome.messages === messages) {
      continue;
    }
    messages = outcome.messages;
    tokensFreed += outcome.tokensFreed;
    evicted.push(...outcome.evicted);
    if (outcome.boundary) boundaries.push(outcome.boundary);
    applied.push(step.reducer.name);
  }

  const shortfall = tokensFreed < plan.deficit;
  logForDebugging(
    `compact-v2: plan=[${plan.steps.map(s => s.reducer.name).join(',')}] applied=[${applied.join(',')}] ` +
      `freed=${tokensFreed}/${plan.deficit}${shortfall ? ' SHORTFALL' : ''}`,
  );
  logEvent('compact_v2_plan_applied', {
    deficit: plan.deficit,
    expectedYield: plan.expectedYield,
    tokensFreed,
    reducers: applied.join(',') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    evictions: evicted.length,
    shortfall,
  });

  return { messages, tokensFreed, evicted, boundaries, applied, shortfall };
}
