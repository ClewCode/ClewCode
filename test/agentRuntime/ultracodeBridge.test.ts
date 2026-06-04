import { afterEach, describe, expect, test } from 'bun:test';
import { tryAutoRunDynamicWorkflow } from '../../src/agentRuntime/ultracodeBridge.ts';
import { createInitialUltracodeState, enableUltracode, markConfirmed, recordWorkflowStart } from '../../src/agentRuntime/ultracode.ts';

const g = globalThis as {
  __appState?: { get?: (k: string) => unknown; set?: (k: string, v: unknown) => void };
  __ultracodePlannerLlm?: unknown;
  __ultracodeAgentRunner?: unknown;
  __ultracodeConfirm?: unknown;
};

function makeAppState() {
  const store = new Map<string, unknown>();
  return {
    get: (k: string) => store.get(k),
    set: (k: string, v: unknown) => {
      store.set(k, v);
    },
    _store: store,
  };
}

afterEach(() => {
  delete g.__appState;
  delete g.__ultracodePlannerLlm;
  delete g.__ultracodeAgentRunner;
  delete g.__ultracodeConfirm;
});

describe('tryAutoRunDynamicWorkflow opt-in', () => {
  test('returns not-triggered when no host hooks are wired up', async () => {
    const out = await tryAutoRunDynamicWorkflow({
      prompt: 'migrate this entire service from CommonJS to ESM across all files',
      workspaceRoot: '/tmp',
      sessionId: 's',
      explicitlyRequested: false,
    });
    expect(out.kind).toBe('not-triggered');
  });

  test('returns suggested when ultracode is off and the classifier fires', async () => {
    g.__appState = makeAppState();
    g.__ultracodePlannerLlm = async () => '{}';
    g.__ultracodeAgentRunner = async () => ({ output: 'x' });
    const out = await tryAutoRunDynamicWorkflow({
      prompt: 'migrate this entire service from CommonJS to ESM across all files',
      workspaceRoot: '/tmp',
      sessionId: 's',
      explicitlyRequested: false,
    });
    expect(out.kind).toBe('suggested');
    if (out.kind === 'suggested') {
      expect(out.message).toContain('ultracode');
      expect(out.classifier.shouldSuggestUltracode).toBe(true);
    }
  });

  test('returns not-triggered when ultracode is off and prompt is short', async () => {
    g.__appState = makeAppState();
    g.__ultracodePlannerLlm = async () => '{}';
    g.__ultracodeAgentRunner = async () => ({ output: 'x' });
    const out = await tryAutoRunDynamicWorkflow({
      prompt: 'fix this',
      workspaceRoot: '/tmp',
      sessionId: 's',
      explicitlyRequested: false,
    });
    expect(out.kind).toBe('not-triggered');
  });

  test('returns not-triggered when ultracode is on but prompt is short', async () => {
    const appState = makeAppState();
    appState.set('ultracodeState', enableUltracode(createInitialUltracodeState()));
    g.__appState = appState;
    g.__ultracodePlannerLlm = async () => '{}';
    g.__ultracodeAgentRunner = async () => ({ output: 'x' });
    const out = await tryAutoRunDynamicWorkflow({
      prompt: 'fix this',
      workspaceRoot: '/tmp',
      sessionId: 's',
      explicitlyRequested: false,
    });
    expect(out.kind).toBe('not-triggered');
  });

  test('skips when cost exceeds ceiling', async () => {
    const appState = makeAppState();
    appState.set('ultracodeState', enableUltracode(createInitialUltracodeState()));
    g.__appState = appState;
    g.__ultracodePlannerLlm = async () =>
      JSON.stringify({
        rationale: 'big plan',
        maxParallel: 4,
        subtasks: [
          ...Array.from({ length: 8 }, (_, i) => ({
            id: `t${i}`,
            role: 'coder',
            title: `T${i}`,
            prompt: 'p',
            dependsOn: [],
            effort: 5,
          })),
          ...Array.from({ length: 6 }, (_, i) => ({
            id: `v${i}`,
            role: 'verifier',
            title: `V${i}`,
            prompt: 'p',
            dependsOn: [],
            effort: 5,
          })),
        ],
      });
    g.__ultracodeAgentRunner = async () => ({ output: 'ok' });
    const out = await tryAutoRunDynamicWorkflow({
      prompt: 'migrate this entire service from CommonJS to ESM across all files end-to-end',
      workspaceRoot: '/tmp',
      sessionId: 's',
      explicitlyRequested: false,
      costCeiling: 'low',
    });
    expect(out.kind).toBe('not-triggered');
    if (out.kind === 'not-triggered') {
      expect(out.reason).toContain('exceeds ceiling');
    }
  });

  test('returns cancelled when confirm hook declines first-run prompt', async () => {
    const appState = makeAppState();
    appState.set('ultracodeState', enableUltracode(createInitialUltracodeState()));
    g.__appState = appState;
    g.__ultracodePlannerLlm = async () =>
      JSON.stringify({
        rationale: 'r',
        subtasks: [
          { id: 'a', role: 'researcher', title: 'A', prompt: 'p', dependsOn: [], effort: 1 },
          { id: 'v', role: 'verifier', title: 'V', prompt: 'p', dependsOn: ['a'], effort: 1 },
        ],
      });
    g.__ultracodeAgentRunner = async () => ({ output: 'ok' });
    g.__ultracodeConfirm = async () => false;
    const out = await tryAutoRunDynamicWorkflow({
      prompt: 'migrate this entire service from CommonJS to ESM across all files',
      workspaceRoot: '/tmp',
      sessionId: 's',
      explicitlyRequested: false,
    });
    expect(out.kind).toBe('cancelled');
  });

  test('runs and returns a synthetic message when triggered end-to-end', async () => {
    const appState = makeAppState();
    // already-confirmed state, so the bridge skips the confirm step
    appState.set(
      'ultracodeState',
      markConfirmed(recordWorkflowStart(enableUltracode(createInitialUltracodeState()))),
    );
    g.__appState = appState;
    g.__ultracodePlannerLlm = async () =>
      JSON.stringify({
        rationale: 'r',
        subtasks: [
          { id: 'a', role: 'researcher', title: 'A', prompt: 'p', dependsOn: [], effort: 1 },
          { id: 'v', role: 'verifier', title: 'V', prompt: 'p', dependsOn: ['a'], effort: 1 },
        ],
      });
    g.__ultracodeAgentRunner = async () => ({ output: 'result' });
    const out = await tryAutoRunDynamicWorkflow({
      prompt: 'migrate this entire service from CommonJS to ESM across all files',
      workspaceRoot: '/tmp',
      sessionId: 's',
      explicitlyRequested: false,
    });
    if (out.kind !== 'ran') {
      throw new Error('expected ran, got ' + JSON.stringify(out));
    }
    expect(out.runId).toBeTruthy();
    if (!('message' in out)) throw new Error('expected message');
    const m = out.message as { type: string; isMeta: boolean; message: { content: Array<{ text: string }> } };
    expect(m.type).toBe('assistant');
    expect(m.isMeta).toBe(true);
    expect(m.message.content[0]!.text).toContain('dynamic workflow');
  });

  test('never throws — planner errors are caught and reported as not-triggered', async () => {
    const appState = makeAppState();
    appState.set(
      'ultracodeState',
      markConfirmed(enableUltracode(createInitialUltracodeState())),
    );
    g.__appState = appState;
    g.__ultracodePlannerLlm = async () => {
      throw new Error('planner blew up');
    };
    g.__ultracodeAgentRunner = async () => ({ output: 'x' });
    const out = await tryAutoRunDynamicWorkflow({
      prompt: 'migrate this entire service from CommonJS to ESM across all files',
      workspaceRoot: '/tmp',
      sessionId: 's',
      explicitlyRequested: false,
    });
    expect(out.kind).toBe('not-triggered');
  });
});
