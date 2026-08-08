import { describe, expect, test } from 'bun:test';
import type { DynamicSubtask, DynamicWorkflow } from './dynamicWorkflow.js';
import { runDynamicWorkflow } from './dynamicWorkflowRunner.js';

function subtask(id: string, dependsOn: string[] = []): DynamicSubtask {
  return { id, role: 'researcher', title: id, prompt: id, dependsOn, effort: 1 };
}

function workflow(subtasks: DynamicSubtask[], maxParallel: number): DynamicWorkflow {
  return {
    id: 'wf-test',
    originalPrompt: 'test',
    createdAt: new Date(0).toISOString(),
    rationale: 'test',
    subtasks,
    maxParallel,
    estimatedTokenCost: 'low',
  };
}

const llm = async () => '{}';

describe('runDynamicWorkflow parallelism bound', () => {
  test('runs every subtask in a wave even when the wave exceeds maxParallel', async () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const ran: string[] = [];

    const result = await runDynamicWorkflow({
      workflow: workflow(
        ids.map(id => subtask(id)),
        2,
      ),
      llm,
      runSubtask: async s => {
        ran.push(s.id);
        return { output: `done:${s.id}` };
      },
    });

    expect(ran.sort()).toEqual([...ids].sort());
    expect(result.results).toHaveLength(ids.length);
  });

  test('never exceeds maxParallel concurrent subtasks', async () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    let inFlight = 0;
    let peak = 0;

    await runDynamicWorkflow({
      workflow: workflow(
        ids.map(id => subtask(id)),
        2,
      ),
      llm,
      runSubtask: async s => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise(resolve => setTimeout(resolve, 5));
        inFlight--;
        return { output: s.id };
      },
    });

    expect(peak).toBeLessThanOrEqual(2);
    expect(peak).toBeGreaterThan(1);
  });

  test('a failed checkpoint write does not abort the wave and is reported', async () => {
    const ids = ['a', 'b', 'c'];

    const result = await runDynamicWorkflow({
      workflow: workflow(
        ids.map(id => subtask(id)),
        3,
      ),
      llm,
      runSubtask: async s => ({ output: s.id }),
      initialState: {
        runId: 'run-1',
        workflowId: 'wf-test',
        startedAt: new Date(0).toISOString(),
        lastCompletedWave: -1,
        results: [],
      } as never,
      persist: async ({ runState, result: persisted }) => {
        if (persisted.subtaskId === 'b') throw new Error('disk full');
        return runState;
      },
    });

    expect(result.results).toHaveLength(3);
    expect(result.unpersisted).toEqual(['b']);
  });
});
