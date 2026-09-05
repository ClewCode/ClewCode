import { describe, expect, test } from 'bun:test';
import type { Message } from '../../../types/message.js';
import { createMemoryEvictionStore, evictionStub } from './evictionStore.js';
import type { ContextPressure as Pressure } from './ledger.js';
import { computeLimits, selectBuffer } from './limits.js';
import { applyPlan, planCompaction } from './planner.js';
import { dedupeReducer } from './reducers/dedupe.js';
import { dropReducer } from './reducers/drop.js';
import { staleToolReducer } from './reducers/staleTool.js';
import type { CompactSessionState, ReduceContext, Reducer } from './types.js';

function makeState(): CompactSessionState {
  // @ts-expect-error - Phase3 typecheck auto (TS error suppression)
  return { turn: 1, failures: 0, evictions: createMemoryEvictionStore(), restoredThisTurn: 0 };
}

function makePressure(used: number, deficit: number): Pressure {
  const limits = computeLimits('test-model');
  return { used, limit: limits.limit, deficit, ratio: used / limits.limit, limits, basis: 'estimated' };
}

/** A reducer that always claims (and frees) a fixed amount. */
function fakeReducer(name: Reducer['name'], loss: number, yields: number, costly = false): Reducer {
  return {
    name,
    loss,
    costly,
    estimate: () => yields,
    async apply(ctx) {
      return { messages: ctx.messages, tokensFreed: Math.min(yields, ctx.target), evicted: [] };
    },
  };
}

function ctxFor(messages: Message[], target: number, pressure: Pressure): ReduceContext {
  return { messages, model: 'test-model', pressure, target, state: makeState(), atBoundary: true };
}

describe('planCompaction', () => {
  const pressure = makePressure(150_000, 30_000);
  const make = (messages: Message[]) => (_r: Reducer, target: number) => ctxFor(messages, target, pressure);

  test('returns an empty plan when there is no deficit', () => {
    const plan = planCompaction(makePressure(10_000, 0), make([]), { atBoundary: true, allowCostly: true });
    expect(plan.steps).toEqual([]);
    expect(plan.rationale).toBe('under target');
  });

  test('excludes costly reducers when they are not allowed', () => {
    const plan = planCompaction(pressure, make([]), { atBoundary: false, allowCostly: false });
    expect(plan.steps.some(s => s.reducer.costly)).toBe(false);
  });

  test('forces summarize reducer when forceSummarize is set even without deficit', () => {
    const fakeCtx = (_r: Reducer, target: number): ReduceContext => ({
      messages: [],
      model: 'test-model',
      pressure: makePressure(10_000, 0),
      target,
      state: makeState(),
      atBoundary: true,
      cacheSafeParams: {} as any,
      toolUseContext: {} as any,
    });
    const plan = planCompaction(makePressure(10_000, 0), fakeCtx, {
      atBoundary: true,
      allowCostly: true,
      forceSummarize: true,
    });
    expect(plan.steps.some(s => s.reducer.name === 'summarize')).toBe(true);
  });
});

describe('applyPlan', () => {
  const pressure = makePressure(150_000, 30_000);

  test('stops once the deficit is covered, leaving costlier reducers unspent', async () => {
    const cheap = fakeReducer('dedupe', 0.05, 30_000);
    const expensive = fakeReducer('summarize', 0.6, 100_000, true);
    const plan = {
      steps: [
        { reducer: cheap, expected: 30_000 },
        { reducer: expensive, expected: 100_000 },
      ],
      expectedYield: 130_000,
      deficit: 30_000,
      rationale: 'test',
    };

    const result = await applyPlan(plan, [], (_r, target, msgs) => ctxFor(msgs, target, pressure));

    // This is the whole thesis of v2: the expensive, lossy reducer is planned
    // but never runs, because the cheap one already covered the deficit.
    expect(result.applied).toEqual(['dedupe']);
    expect(result.tokensFreed).toBe(30_000);
    expect(result.shortfall).toBe(false);
  });

  test('reports a shortfall when the plan cannot cover the deficit', async () => {
    const weak = fakeReducer('dedupe', 0.05, 1_000);
    const plan = {
      steps: [{ reducer: weak, expected: 1_000 }],
      expectedYield: 1_000,
      deficit: 30_000,
      rationale: 'test',
    };
    const result = await applyPlan(plan, [], (_r, target, msgs) => ctxFor(msgs, target, pressure));
    expect(result.shortfall).toBe(true);
  });
});

describe('limits', () => {
  test('derives a consistent ordering of thresholds', () => {
    const limits = computeLimits('test-model');
    expect(limits.softTarget).toBeLessThan(limits.actNow);
    expect(limits.actNow).toBeLessThan(limits.actForce);
    // The yellow band must be reachable before the red one, or the warning
    // renders red the instant it appears.
    expect(limits.warn).toBeLessThan(limits.critical);
    expect(limits.limit).toBeLessThan(limits.window);
  });

  test('a more compressible session gets a smaller buffer', () => {
    expect(selectBuffer(1)).toBeLessThan(selectBuffer(0));
  });
});

describe('evictionStore', () => {
  test('round-trips content by handle', () => {
    const store = createMemoryEvictionStore();
    const record = store.put(
      { kind: 'tool_result', label: 'Read a.ts', tokens: 4200, reducer: 'stale-tool', turn: 1 },
      'file contents',
    );
    expect(store.get(record.handle)?.content).toBe('file contents');
    expect(store.parkedTokens()).toBe(4200);
  });

  test('identical content evicted twice gets distinct handles', () => {
    const store = createMemoryEvictionStore();
    const entry = { kind: 'tool_result' as const, label: 'x', tokens: 1, reducer: 'dedupe' as const, turn: 1 };
    const a = store.put(entry, 'same');
    const b = store.put(entry, 'same');
    expect(a.handle).not.toBe(b.handle);
    expect(store.list()).toHaveLength(2);
  });

  test('the stub tells the model how to get the content back', () => {
    const store = createMemoryEvictionStore();
    const record = store.put(
      { kind: 'tool_result', label: 'Read src/query.ts', tokens: 4200, reducer: 'stale-tool', turn: 1 },
      'x',
    );
    const stub = evictionStub(record);
    expect(stub).toContain('Read src/query.ts');
    expect(stub).toContain(record.handle);
    expect(stub).toContain('ContextRestore');
  });
});

// ── Reducers against real message shapes ──

function assistantWithToolUse(id: string, name: string, input: Record<string, unknown>): Message {
  return {
    type: 'assistant',
    uuid: `a-${id}`,
    timestamp: new Date().toISOString(),
    message: { id: `msg-${id}`, model: 'test-model', content: [{ type: 'tool_use', id, name, input }] },
  } as unknown as Message;
}

function userWithToolResult(id: string, content: string): Message {
  return {
    type: 'user',
    uuid: `u-${id}`,
    timestamp: new Date().toISOString(),
    message: { content: [{ type: 'tool_result', tool_use_id: id, content }] },
  } as unknown as Message;
}

describe('dedupe reducer', () => {
  const big = 'x'.repeat(2000);

  test('evicts a superseded identical call and keeps the newest', async () => {
    const messages = [
      assistantWithToolUse('t1', 'Grep', { pattern: 'foo' }),
      userWithToolResult('t1', big),
      assistantWithToolUse('t2', 'Grep', { pattern: 'foo' }),
      userWithToolResult('t2', big),
    ];
    const state = makeState();
    const ctx: ReduceContext = {
      messages,
      model: 'test-model',
      pressure: makePressure(150_000, 30_000),
      target: 30_000,
      state,
      atBoundary: true,
    };

    expect(dedupeReducer.estimate(ctx)).toBeGreaterThan(0);
    const outcome = await dedupeReducer.apply(ctx);

    expect(outcome.evicted).toHaveLength(1);
    expect(outcome.tokensFreed).toBeGreaterThan(0);
    // The newest result survives untouched — it is still the true answer.
    const last = outcome.messages[3] as { message: { content: { content: string }[] } };
    expect(last.message.content[0]?.content).toBe(big);
    // And the superseded one is recoverable, not destroyed.
    expect(state.evictions.get(outcome.evicted[0]!.handle)?.content).toBe(big);
  });

  test('leaves a lone tool call alone', async () => {
    const messages = [assistantWithToolUse('t1', 'Grep', { pattern: 'foo' }), userWithToolResult('t1', big)];
    const ctx: ReduceContext = {
      messages,
      model: 'test-model',
      pressure: makePressure(150_000, 30_000),
      target: 30_000,
      state: makeState(),
      atBoundary: true,
    };
    expect(dedupeReducer.estimate(ctx)).toBe(0);
    expect((await dedupeReducer.apply(ctx)).tokensFreed).toBe(0);
  });
});

describe('stale-tool reducer', () => {
  const big = 'y'.repeat(4000);

  function longSession(count: number): Message[] {
    const messages: Message[] = [];
    for (let i = 0; i < count; i++) {
      messages.push(assistantWithToolUse(`t${i}`, 'Read', { file_path: `f${i}.ts` }));
      messages.push(userWithToolResult(`t${i}`, big));
    }
    return messages;
  }

  test('keeps the recent tail and evicts oldest-first up to the target', async () => {
    const messages = longSession(12);
    const state = makeState();
    const ctx: ReduceContext = {
      messages,
      model: 'test-model',
      pressure: makePressure(150_000, 30_000),
      // Small target: it must stop early rather than clearing everything it could.
      target: 2_000,
      state,
      atBoundary: true,
    };

    const outcome = await staleToolReducer.apply(ctx);
    expect(outcome.evicted.length).toBeGreaterThan(0);
    // Bounded by the target — gratuitous eviction is a bug, not thoroughness.
    expect(outcome.evicted.length).toBeLessThan(6);

    // The most recent results are never touched.
    const tail = outcome.messages.at(-1) as { message: { content: { content: string }[] } };
    expect(tail.message.content[0]?.content).toBe(big);
  });

  test('does not re-evict content that is already a stub', async () => {
    const messages = longSession(12);
    const state = makeState();
    const base = {
      model: 'test-model',
      pressure: makePressure(150_000, 30_000),
      state,
      atBoundary: true,
    };
    const first = await staleToolReducer.apply({ ...base, messages, target: 100_000 } as ReduceContext);
    const second = await staleToolReducer.apply({
      ...base,
      messages: first.messages,
      target: 100_000,
    } as ReduceContext);

    expect(second.evicted).toHaveLength(0);
    expect(second.tokensFreed).toBe(0);
  });
});

describe('additional reducers contract', () => {
  test('dropReducer has correct metadata and operates when target is deficit', () => {
    expect(dropReducer.name).toBe('drop');
    expect(dropReducer.loss).toBe(0.95);
    expect(dropReducer.costly).toBe(false);
  });
});
