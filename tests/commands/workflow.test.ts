import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { call } from '../../src/commands/workflow/workflow.ts';
import {
  cancelDynamicRun,
  createDynamicRun,
  listAllDynamicRuns,
  loadDynamicRun,
} from '../../src/agentRuntime/dynamicWorkflowPersistence.ts';
import type { DynamicWorkflow } from '../../src/agentRuntime/dynamicWorkflow.ts';

function makeWorkflow(id: string, prompt: string): DynamicWorkflow {
  return {
    id,
    originalPrompt: prompt,
    createdAt: new Date().toISOString(),
    rationale: 'test',
    maxParallel: 4,
    estimatedTokenCost: 'low',
    subtasks: [
      { id: 'a', role: 'researcher', title: 'A', prompt: 'do a', dependsOn: [], effort: 1 },
      { id: 'b', role: 'coder', title: 'B', prompt: 'do b', dependsOn: ['a'], verifiedBy: 'v', effort: 1 },
      { id: 'v', role: 'verifier', title: 'V', prompt: 'verify', dependsOn: [], effort: 1 },
    ],
  };
}

const context = {} as Parameters<typeof call>[1];

let workdir = '';

beforeEach(async () => {
  workdir = await fs.mkdtemp(path.join(os.tmpdir(), 'workflow-cmd-'));
  (globalThis as { __workflowWorkspaceRoot?: string }).__workflowWorkspaceRoot = workdir;
});

afterEach(async () => {
  if (workdir) await fs.rm(workdir, { recursive: true, force: true });
  delete (globalThis as { __workflowWorkspaceRoot?: string }).__workflowWorkspaceRoot;
});

describe('/workflow list', () => {
  test('reports no runs when the directory is empty', async () => {
    const result = await call('', context);
    if (result.type !== 'text') throw new Error('expected text result');
    expect(result.value).toContain('no persisted dynamic runs');
  });

  test('lists all runs regardless of status', async () => {
    await createDynamicRun(workdir, makeWorkflow('wf-running', 'audit'));
    await createDynamicRun(workdir, makeWorkflow('wf-cancelled', 'migrate'));
    const loaded = await loadDynamicRun(workdir, 'wf-cancelled');
    if (loaded) {
      await fs.writeFile(
        path.join(workdir, '.claude', 'runs', 'wf-cancelled', 'state.json'),
        JSON.stringify({ ...loaded.state, status: 'cancelled' }, null, 2),
      );
    }

    const result = await call('list', context);
    if (result.type !== 'text') throw new Error('expected text result');
    expect(result.value).toContain('wf-running');
    expect(result.value).toContain('wf-cancelled');
  });
});

describe('/workflow show', () => {
  test('returns the plan summary for a known id', async () => {
    await createDynamicRun(workdir, makeWorkflow('wf-show', 'audit auth'));
    const result = await call('show wf-show', context);
    if (result.type !== 'text') throw new Error('expected text result');
    expect(result.value).toContain('wf-show');
    expect(result.value).toContain('audit auth');
    expect(result.value).toContain('subtasks:');
  });

  test('reports missing run', async () => {
    const result = await call('show nope', context);
    if (result.type !== 'text') throw new Error('expected text result');
    expect(result.value).toContain('no run found');
  });

  test('requires an id', async () => {
    const result = await call('show', context);
    if (result.type !== 'text') throw new Error('expected text result');
    expect(result.value).toContain('Usage');
  });
});

describe('/workflow resume', () => {
  test('marks a paused run as ready to resume', async () => {
    await createDynamicRun(workdir, makeWorkflow('wf-pause', 'audit'));
    // simulate a previously-paused state
    const loaded = await loadDynamicRun(workdir, 'wf-pause');
    if (loaded) {
      await fs.writeFile(
        path.join(workdir, '.claude', 'runs', 'wf-pause', 'state.json'),
        JSON.stringify({ ...loaded.state, status: 'paused' }, null, 2),
      );
    }
    const result = await call('resume wf-pause', context);
    if (result.type !== 'text') throw new Error('expected text result');
    expect(result.value).toContain('marked ready to resume');
    expect(result.value).toContain('wf-pause');
  });

  test('refuses to resume a completed run', async () => {
    await createDynamicRun(workdir, makeWorkflow('wf-done', 'audit'));
    const loaded = await loadDynamicRun(workdir, 'wf-done');
    if (loaded) {
      await fs.writeFile(
        path.join(workdir, '.claude', 'runs', 'wf-done', 'state.json'),
        JSON.stringify({ ...loaded.state, status: 'completed' }, null, 2),
      );
    }
    const result = await call('resume wf-done', context);
    if (result.type !== 'text') throw new Error('expected text result');
    expect(result.value).toContain('already completed');
  });
});

describe('/workflow cancel', () => {
  test('cancels a running run and preserves results on disk', async () => {
    await createDynamicRun(workdir, makeWorkflow('wf-cancel-me', 'migrate'));
    const result = await call('cancel wf-cancel-me', context);
    if (result.type !== 'text') throw new Error('expected text result');
    expect(result.value).toContain('cancelled');
    const after = await loadDynamicRun(workdir, 'wf-cancel-me');
    expect(after?.state.status).toBe('cancelled');
  });

  test('reports already-cancelled run without re-mutating', async () => {
    await createDynamicRun(workdir, makeWorkflow('wf-already', 'migrate'));
    await cancelDynamicRun(workdir, 'wf-already');
    const result = await call('cancel wf-already', context);
    if (result.type !== 'text') throw new Error('expected text result');
    expect(result.value).toContain('already cancelled');
  });

  test('reports missing run', async () => {
    const result = await call('cancel ghost', context);
    if (result.type !== 'text') throw new Error('expected text result');
    expect(result.value).toContain('no run found');
  });
});

describe('persistence helpers', () => {
  test('listAllDynamicRuns returns runs in reverse chronological order', async () => {
    await createDynamicRun(workdir, makeWorkflow('wf-1', 'first'));
    // backdate wf-1
    const older = await loadDynamicRun(workdir, 'wf-1');
    if (older) {
      await fs.writeFile(
        path.join(workdir, '.claude', 'runs', 'wf-1', 'state.json'),
        JSON.stringify({ ...older.state, startedAt: '2020-01-01T00:00:00.000Z' }, null, 2),
      );
    }
    await createDynamicRun(workdir, makeWorkflow('wf-2', 'second'));
    const runs = await listAllDynamicRuns(workdir);
    expect(runs.map(r => r.workflowId)).toEqual(['wf-2', 'wf-1']);
  });
});
