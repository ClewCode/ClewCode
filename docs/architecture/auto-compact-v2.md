# Auto-Compact v2

Auto-Compact v2 is the single context-reduction pipeline used by Clew Code. It replaces the older collection of independent snip/microcompact/full-compact mechanisms with one pressure measurement, one planner, and one reducer contract.

Source: `src/services/compact/v2/`.

## Current active pipeline

```text
messages
  |
  v
ContextLedger.measure()
  |
  v
ContextPressure { used, limit, deficit, ratio, basis }
  |
  v
planCompaction()
  |
  +--> dedupe       loss 0.05
  +--> stale-tool   loss 0.20
  +--> summarize    loss 0.60 (LLM / costly)
  `--> drop         loss 0.95 (last resort)
  |
  v
applyPlan()
  |
  +--> updated messages
  +--> tokensFreed
  +--> eviction records / restore handles
  `--> compact boundaries
```

The order in `planner.ts` is policy: cheapest information loss is spent first. `drop` is a fallback and is not part of the normal ladder unless the lower-loss reducers cannot cover the deficit.

## Removed reducer surfaces

The runtime contract now exposes only active reducers:

```ts
type ReducerName = 'dedupe' | 'stale-tool' | 'summarize' | 'drop';
```

The following reducer implementations/types are removed because they had no active planner path or caller:

- `snip`
- `ast-skeleton`
- `state-compress`
- `scored-tool`
- `summarize-enhanced`
- `intelligent-prune`

Do not keep disabled reducer implementations in-tree “for later”. Reintroducing one should include an eval showing that it adds measurable value over the active ladder, plus planner tests and reducer-specific tests.

## Context ledger

`ContextLedger` owns context-pressure accounting. Reducers do not thread manual `snipTokensFreed`-style offsets through unrelated layers.

Conceptually:

```ts
interface ContextPressure {
  used: number;
  limit: number;
  deficit: number;
  ratio: number;
  basis: 'api_usage' | 'estimated' | 'mixed';
}
```

The ledger prefers API usage when available and uses estimation/fallback logic when it is not. A reducer reports actual reclaimed tokens back through its `ReduceOutcome`.

## Limits and triggering

`computeLimits(model)` in `limits.ts` derives the usable context boundary from the model window and reserved output allowance. The planner runs only when there is pressure to relieve, except explicit manual compaction.

Important properties:

- one limit calculation per compaction decision;
- one planner for automatic and manual reduction;
- model/provider changes must resolve the correct context window before planning;
- a planner shortfall is surfaced rather than silently treated as success.

## Reducer contract

Every reducer implements the same interface:

```ts
interface Reducer {
  name: ReducerName;
  readonly loss: number;
  readonly costly: boolean;
  estimate(ctx: ReduceContext): number;
  apply(ctx: ReduceContext): Promise<ReduceOutcome>;
}

interface ReduceOutcome {
  messages: Message[];
  tokensFreed: number;
  evicted: EvictionRecord[];
  boundary?: Message;
}
```

`estimate()` must be fast and side-effect free. The planner can call it repeatedly while choosing a plan.

## Active reducers

### `dedupe`

Removes superseded/duplicated re-readable tool results. Lowest loss and first choice.

### `stale-tool`

Evicts older tool results that can be restored/re-read when needed. Uses the shared tool-result eviction helpers and emits restore metadata.

### `summarize`

LLM-backed compaction for information that cannot be safely reclaimed by deterministic reducers. Marked costly and skipped when the current execution context disallows an LLM fork.

Manual `/compact` can force the summarize path and pass custom instructions.

### `drop`

Last-resort lossy reduction. Used only when cheaper reducers cannot reclaim enough context.

## Eviction and restoration

Re-readable content can be written to the per-session `EvictionStore`. The compacted transcript keeps enough metadata for `ContextRestore` to retrieve evicted content by handle.

When the normal session store is unavailable (for example, a restricted/forked execution context), v2 falls back to an in-memory eviction store rather than failing the entire request.

## Session state and concurrency

Compaction state is per session/agent, not a module-global singleton:

```ts
interface CompactSessionState {
  agentId?: AgentId;
  turn: number;
  failures: number;
  evictions: EvictionStore;
  restoredThisTurn: number;
  health: CompactHealth;
}
```

This prevents concurrent agents from sharing failure counters, restoration budgets, or eviction bookkeeping.

## Boundary and costly work

`RunCompactionOptions` carries `atBoundary` and manual/force flags. Non-costly reducers can operate independently of LLM summarization constraints. Costly reducers are skipped when `allowCostly` is false.

Any reducer that would strand an incomplete tool-use/result relationship must no-op rather than corrupting the transcript.

## Failure behavior

The v2 entry point returns an explicit `shortfall` when the plan cannot free the required context. Callers must surface or handle this state; swallowing it can turn a recoverable context problem into a later provider error.

Persistence/eviction failures are logged and, where possible, use an in-memory fallback. Compaction must never report success based only on an attempted write.

## Tests and invariants

Keep these invariants covered:

1. `REDUCERS` contains only the active ordered ladder: `dedupe`, `stale-tool`, `summarize`, `drop`.
2. loss ordering remains strictly cheapest-first.
3. planner stops once the deficit is covered.
4. `drop` is used only as fallback.
5. costly reducers are excluded when `allowCostly` is false.
6. manual compact can force summarize.
7. per-agent/session health and eviction state do not leak across concurrent runs.
8. removed reducer names/files are not reintroduced without a tested planner path.

Run the repository gate after compaction changes:

```bash
bun run check:ci && bun x tsc --noEmit && bun test --bail
```
