/**
 * Enforcement regression tests: network permission, byte budgets,
 * approval input preservation, and loop budget termination.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BUILTIN_AGENTS } from './config.js';
import { MockLLMAdapter, Orchestrator } from './orchestrator.js';
import { RunStore } from './runStore.js';
import { ToolGateway } from './toolGateway.js';
import type { AgentRun } from './types.js';

let root = '';

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'clew-enforce-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function testRun(id: string): AgentRun {
  const now = new Date().toISOString();
  return {
    id,
    task: 'test',
    workflow: 'coding-task',
    status: 'running',
    activeAgent: 'coder',
    workspace: root,
    createdAt: now,
    updatedAt: now,
    budget: {
      maxSteps: 40,
      maxToolCalls: 120,
      maxLlmCalls: 40,
      timeoutMs: 1800000,
      maxOutputBytesPerTool: 20000,
      maxPatchBytes: 100000,
      maxChangedFiles: 20,
      maxCostUsd: null,
    },
  };
}

describe('network permission enforcement', () => {
  test('network:deny blocks git fetch for shell-allowed tester', async () => {
    const gateway = new ToolGateway(new RunStore(root), root);
    const decision = await gateway.authorize('run-x', BUILTIN_AGENTS['tester']!, 'shell.run', {
      command: 'git fetch origin',
    });
    expect(decision.action).toBe('deny');
  });

  test('network:deny blocks curl for coder', async () => {
    const gateway = new ToolGateway(new RunStore(root), root);
    const decision = await gateway.authorize('run-x', BUILTIN_AGENTS['coder']!, 'shell.run', {
      command: 'curl https://example.com',
    });
    expect(decision.action).toBe('deny');
  });

  test('non-network commands still pass the network check', async () => {
    const gateway = new ToolGateway(new RunStore(root), root);
    const decision = await gateway.authorize('run-x', BUILTIN_AGENTS['coder']!, 'shell.run', {
      command: 'bun test',
    });
    // coder shell is guarded → ask_user for any command, but NOT a network deny
    expect(decision.action).toBe('ask_user');
    if (decision.action === 'ask_user') {
      expect(decision.reason).not.toMatch(/network/i);
    }
  });
});

describe('tool gateway contract', () => {
  test('unimplemented eval tools are denied instead of authorized then failing during execution', async () => {
    const gateway = new ToolGateway(new RunStore(root), root);
    const agent = {
      ...BUILTIN_AGENTS['coder']!,
      tools: [...BUILTIN_AGENTS['coder']!.tools, 'eval.score'],
    };

    const decision = await gateway.authorize('run-x', agent, 'eval.score', {});

    expect(decision.action).toBe('deny');
  });
});

describe('byte budgets', () => {
  test('repo.patch exceeding maxPatchBytes throws before writing', async () => {
    const store = new RunStore(root);
    await store.init();
    const runId = await store.generateRunId();
    await store.createRun(testRun(runId));
    const gateway = new ToolGateway(store, root);
    const big = `x`.repeat(100001);
    let threw = false;
    try {
      await gateway.execute(runId, 'coder', 'repo.patch', { path: 'evil.txt', patch: big });
    } catch (error) {
      threw = true;
      expect((error as Error).message).toMatch(/exceeds budget/);
    }
    expect(threw).toBe(true);
  });
});

describe('orchestrator approval + budgets', () => {
  async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 15000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await predicate()) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('timed out waiting for run state');
  }

  test('approval resume preserves the full original tool input', async () => {
    const mock = new MockLLMAdapter();
    const fullInput = { command: 'echo approval-probe', timeout: 5000 };
    mock.setPresetActions('coder', [
      { type: 'tool_call', tool: 'shell.run', input: fullInput },
      { type: 'complete', summary: 'done' },
    ]);
    const orchestrator = new Orchestrator(root, mock);
    const runId = await orchestrator.startRun('approval input test');
    // Drive the loop in the background (as the runtime does).
    void (orchestrator as unknown as { runLoop: (id: string) => Promise<void> }).runLoop(runId);

    const store = new RunStore(root);
    await waitFor(async () => (await store.loadRun(runId)).status === 'waiting_approval');
    const state = await store.loadState(runId);
    expect(state.openApprovals.length).toBe(1);
    expect(state.openApprovals[0]!.input).toEqual(fullInput);

    await orchestrator.processApproval(runId, state.openApprovals[0]!.id, true);
    await waitFor(async () => {
      const status = (await store.loadRun(runId)).status;
      return status === 'completed' || status === 'failed';
    });
    expect((await store.loadRun(runId)).status).toBe('completed');

    const events = await store.loadEvents(runId);
    const requested = events.find(e => e.type === 'tool.requested' && e.tool === 'shell.run');
    expect(requested).toBeDefined();
    // The resumed execution must carry the FULL input — not a reconstructed
    // `{ command }` that drops `timeout` and friends.
    expect((requested!.data as { input: unknown }).input).toEqual(fullInput);
  });

  test('workflow required_for forces approval even when permissions allow', async () => {
    const mock = new MockLLMAdapter();
    mock.setPresetActions('coder', [
      { type: 'tool_call', tool: 'shell.run', input: { command: 'git push origin main' } },
      { type: 'complete', summary: 'done' },
    ]);
    const orchestrator = new Orchestrator(root, mock);
    const runId = await orchestrator.startRun('policy test');
    void (orchestrator as unknown as { runLoop: (id: string) => Promise<void> }).runLoop(runId);
    const store = new RunStore(root);
    // coding-task requires approval for git.push: coder must land in
    // waiting_approval even though its own shell permission handling
    // would otherwise deny/allow without asking.
    await waitFor(async () => (await store.loadRun(runId)).status === 'waiting_approval');
    const state = await store.loadState(runId);
    // git push matches both shell.network and git.push policy entries —
    // either way it must be a workflow-policy approval, not a silent allow.
    expect(state.openApprovals[0]!.reason).toMatch(/Workflow policy requires approval/);
    // Deny to end the run deterministically (no real push is attempted).
    await orchestrator.processApproval(runId, state.openApprovals[0]!.id, false);
    await waitFor(async () => {
      const status = (await store.loadRun(runId)).status;
      return status === 'failed' || status === 'completed';
    });
  });

  test('agent max_steps budget terminates a looping agent', async () => {
    const mock = new MockLLMAdapter();
    // No presets: default coder keeps emitting repo.patch forever.
    // Planner hands off to coder on iteration 1; coder must be stopped by
    // its own max_steps (20) rather than looping to the run cap (50).
    const orchestrator = new Orchestrator(root, mock);
    const runId = await orchestrator.startRun('agent steps test');
    await (orchestrator as unknown as { runLoop: (id: string) => Promise<void> }).runLoop(runId);
    const store = new RunStore(root);
    const final = await store.loadRun(runId);
    expect(final.status).toBe('failed');
    const state = await store.loadState(runId);
    expect(state.agentSteps['coder']).toBeLessThanOrEqual(20);
    expect(state.step).toBeLessThan(50);
  });

  test('expired timeout budget terminates the run', async () => {
    const mock = new MockLLMAdapter();
    const orchestrator = new Orchestrator(root, mock);
    const runId = await orchestrator.startRun('timeout test');
    const store = new RunStore(root);
    const run = await store.loadRun(runId);
    run.budget.timeoutMs = 0; // already expired
    await store.saveRun(run);
    await (orchestrator as unknown as { runLoop: (id: string) => Promise<void> }).runLoop(runId);
    const final = await store.loadRun(runId);
    expect(final.status).toBe('failed');
    const events = await store.loadEvents(runId);
    expect(events.some(e => e.type === 'run.failed')).toBe(true);
  });
});
