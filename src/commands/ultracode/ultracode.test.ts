import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { call } from './ultracode.js';

type UltracodeGlobals = typeof globalThis & {
  __appState?: unknown;
  __ultracodePlannerLlm?: unknown;
  __ultracodeAgentRunner?: unknown;
  __ultracodeConfirm?: unknown;
};

const g = globalThis as UltracodeGlobals;
const saved = {
  appState: g.__appState,
  planner: g.__ultracodePlannerLlm,
  runner: g.__ultracodeAgentRunner,
  confirm: g.__ultracodeConfirm,
};

beforeEach(() => {
  delete g.__appState;
  delete g.__ultracodePlannerLlm;
  delete g.__ultracodeAgentRunner;
  delete g.__ultracodeConfirm;
});

afterEach(() => {
  g.__appState = saved.appState;
  g.__ultracodePlannerLlm = saved.planner;
  g.__ultracodeAgentRunner = saved.runner;
  g.__ultracodeConfirm = saved.confirm;
});

describe('/ultracode run', () => {
  it('reports missing runtime hooks instead of silently returning skip', async () => {
    const result = await call('run inspect this repository', {} as never);

    expect(result.type).toBe('text');
    if (result.type === 'text') {
      expect(result.value).toContain('workflow could not start');
      expect(result.value).toContain('no ultracode hooks wired up');
    }
  });

  it('keeps the missing-prompt usage error explicit', async () => {
    expect(await call('run', {} as never)).toEqual({ type: 'text', value: 'Usage: /ultracode run <prompt>' });
  });
});
