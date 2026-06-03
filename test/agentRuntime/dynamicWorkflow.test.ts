import { describe, expect, test } from 'bun:test';
import {
  type DynamicSubtask,
  type DynamicWorkflow,
  type PlannerLlm,
  computeExecutionWaves,
  planDynamicWorkflow,
  shouldUseDynamicWorkflow,
} from '../../src/agentRuntime/dynamicWorkflow.ts';
import { verifyFinding } from '../../src/agentRuntime/verifierAgent.ts';
import { runDynamicWorkflow } from '../../src/agentRuntime/dynamicWorkflowRunner.ts';
import {
  ULTRACODE_GLYPH,
  createInitialUltracodeState,
  disableUltracode,
  enableUltracode,
  formatConfirmationPrompt,
  markConfirmed,
  recordWorkflowStart,
  shouldAutoTriggerWorkflow,
  shouldRequestConfirmation,
} from '../../src/agentRuntime/ultracode.ts';

function fakeLlm(json: string): PlannerLlm {
  return async () => json;
}

describe('shouldUseDynamicWorkflow heuristic', () => {
  test('rejects short prompts', () => {
    expect(shouldUseDynamicWorkflow('fix this bug')).toBe(false);
  });

  test('accepts prompts with explicit migration keyword', () => {
    expect(shouldUseDynamicWorkflow('migrate this entire service from CommonJS to ESM across all files')).toBe(true);
  });

  test('accepts long multi-verb prompts', () => {
    const long = 'Refactor the auth module, update all tests, replace deprecated APIs, and add security audit checks for the new endpoints that handle user input. Make sure all existing tests still pass.';
    expect(shouldUseDynamicWorkflow(long)).toBe(true);
  });

  test('rejects long but single-verb prompts', () => {
    const long = 'Explain in great detail how the database connection pool works in this codebase, including the rationale for the chosen pool size, the timeout behavior, and how it interacts with the rest of the request lifecycle. Be thorough.';
    expect(shouldUseDynamicWorkflow(long)).toBe(false);
  });
});

describe('planDynamicWorkflow', () => {
  const sampleJson = JSON.stringify({
    rationale: 'Test rationale',
    maxParallel: 4,
    subtasks: [
      { id: 'find_bugs_a', role: 'researcher', title: 'Find bugs in module A', prompt: '...', dependsOn: [], effort: 2 },
      { id: 'find_bugs_b', role: 'researcher', title: 'Find bugs in module B', prompt: '...', dependsOn: [], effort: 2 },
      { id: 'verify_a', role: 'verifier', title: 'Verify A findings', prompt: '...', dependsOn: ['find_bugs_a'], verifiedBy: undefined, effort: 2 },
      { id: 'verify_b', role: 'verifier', title: 'Verify B findings', prompt: '...', dependsOn: ['find_bugs_b'], effort: 2 },
      { id: 'final_report', role: 'reviewer', title: 'Compile report', prompt: '...', dependsOn: ['verify_a', 'verify_b'], effort: 1 },
    ],
  });

  test('parses planner output into DynamicWorkflow', async () => {
    const wf = await planDynamicWorkflow('audit codebase for bugs', fakeLlm(sampleJson));
    expect(wf.subtasks).toHaveLength(5);
    expect(wf.maxParallel).toBe(4);
    expect(wf.rationale).toBe('Test rationale');
    expect(wf.subtasks[0]!.id).toBe('find_bugs_a');
  });

  test('tolerates json wrapped in fences', async () => {
    const wrapped = '```json\n' + sampleJson + '\n```';
    const wf = await planDynamicWorkflow('audit', fakeLlm(wrapped));
    expect(wf.subtasks).toHaveLength(5);
  });

  test('recovers json embedded in prose', async () => {
    const prose = 'Here you go:\n' + sampleJson + '\nThanks!';
    const wf = await planDynamicWorkflow('audit', fakeLlm(prose));
    expect(wf.subtasks).toHaveLength(5);
  });

  test('throws on empty subtask list', async () => {
    await expect(planDynamicWorkflow('x', fakeLlm('{"subtasks":[]}'))).rejects.toThrow(/empty/);
  });

  test('throws on invalid json', async () => {
    await expect(planDynamicWorkflow('x', fakeLlm('not json'))).rejects.toThrow();
  });

  test('throws on cycle', async () => {
    const cyclic = JSON.stringify({
      rationale: 'cycle',
      subtasks: [
        { id: 'a', role: 'researcher', title: 'A', prompt: '...', dependsOn: ['b'], effort: 1 },
        { id: 'b', role: 'researcher', title: 'B', prompt: '...', dependsOn: ['a'], effort: 1 },
      ],
    });
    await expect(planDynamicWorkflow('x', fakeLlm(cyclic))).rejects.toThrow(/cycle/);
  });

  test('drops dangling verifiedBy reference', async () => {
    const json = JSON.stringify({
      rationale: 'dangling',
      subtasks: [
        { id: 'a', role: 'coder', title: 'A', prompt: '...', dependsOn: [], verifiedBy: 'ghost', effort: 1 },
      ],
    });
    const wf = await planDynamicWorkflow('x', fakeLlm(json));
    expect(wf.subtasks[0]!.verifiedBy).toBeUndefined();
  });

  test('clamps maxParallel into [2,10]', async () => {
    const high = JSON.stringify({ rationale: 'h', maxParallel: 100, subtasks: [{ id: 'a', role: 'researcher', title: 'A', prompt: 'p', dependsOn: [], effort: 1 }] });
    const low = JSON.stringify({ rationale: 'l', maxParallel: 0, subtasks: [{ id: 'a', role: 'researcher', title: 'A', prompt: 'p', dependsOn: [], effort: 1 }] });
    expect((await planDynamicWorkflow('x', fakeLlm(high))).maxParallel).toBe(10);
    expect((await planDynamicWorkflow('x', fakeLlm(low))).maxParallel).toBe(2);
  });

  test('classifies token cost tier from effort + verifiers', async () => {
    const make = (effort: number, verifiers: number) =>
      JSON.stringify({
        rationale: 'r',
        subtasks: [
          ...Array.from({ length: verifiers }, (_, i) => ({ id: `v${i}`, role: 'verifier', title: 'V', prompt: 'p', dependsOn: [], effort: 5 })),
          ...Array.from({ length: effort }, (_, i) => ({ id: `m${i}`, role: 'coder', title: 'M', prompt: 'p', dependsOn: [], effort: 5 })),
        ],
      });
    // effort is clamped to [1,5], so 1 small task => 5 effort = 'low'
    expect((await planDynamicWorkflow('x', fakeLlm(make(1, 0)))).estimatedTokenCost).toBe('low');
    // 2 medium tasks + 1 verifier => 15 effort = 'medium'
    expect((await planDynamicWorkflow('x', fakeLlm(make(2, 1)))).estimatedTokenCost).toBe('medium');
    // 4 medium tasks + 3 verifiers = 35 effort + 3 verifiers => 'high' via verifiers>=3
    expect((await planDynamicWorkflow('x', fakeLlm(make(4, 3)))).estimatedTokenCost).toBe('high');
    // 8 medium tasks + 6 verifiers = 70 effort + 6 verifiers => 'very-high'
    expect((await planDynamicWorkflow('x', fakeLlm(make(8, 6)))).estimatedTokenCost).toBe('very-high');
  });
});

describe('computeExecutionWaves', () => {
  const make = (subtasks: DynamicSubtask[]): DynamicWorkflow => ({
    id: 'wf',
    originalPrompt: 'p',
    createdAt: new Date().toISOString(),
    rationale: 'r',
    subtasks,
    maxParallel: 4,
    estimatedTokenCost: 'low',
  });

  test('groups independent subtasks into one wave', () => {
    const wf = make([
      { id: 'a', role: 'researcher', title: 'A', prompt: 'p', dependsOn: [], effort: 1 },
      { id: 'b', role: 'researcher', title: 'B', prompt: 'p', dependsOn: [], effort: 1 },
    ]);
    expect(computeExecutionWaves(wf)).toHaveLength(1);
    expect(computeExecutionWaves(wf)[0]!.map(s => s.id).sort()).toEqual(['a', 'b']);
  });

  test('serializes dependent subtasks across waves', () => {
    const wf = make([
      { id: 'a', role: 'researcher', title: 'A', prompt: 'p', dependsOn: [], effort: 1 },
      { id: 'b', role: 'coder', title: 'B', prompt: 'p', dependsOn: ['a'], effort: 1 },
    ]);
    const waves = computeExecutionWaves(wf);
    expect(waves).toHaveLength(2);
    expect(waves[0]![0]!.id).toBe('a');
    expect(waves[1]![0]!.id).toBe('b');
  });

  test('puts verifiers and reviewers after sibling coders in the same wave', () => {
    const wf = make([
      { id: 'a', role: 'verifier', title: 'V', prompt: 'p', dependsOn: [], effort: 1 },
      { id: 'b', role: 'coder', title: 'C', prompt: 'p', dependsOn: [], effort: 1 },
    ]);
    const wave = computeExecutionWaves(wf)[0]!;
    expect(wave[0]!.id).toBe('b');
    expect(wave[1]!.id).toBe('a');
  });
});

describe('verifyFinding', () => {
  test('parses confirmed verdict', async () => {
    const v = await verifyFinding({
      finding: 'auth is missing on /admin',
      context: '',
      llm: fakeLlm(JSON.stringify({ status: 'confirmed', reason: 'I checked the router and confirmed no auth middleware' })),
    });
    expect(v.status).toBe('confirmed');
  });

  test('parses refuted verdict with suggested fix', async () => {
    const v = await verifyFinding({
      finding: 'X',
      context: '',
      llm: fakeLlm(JSON.stringify({ status: 'refuted', reason: 'wrong file', suggestedFix: 'check Y' })),
    });
    if (v.status !== 'refuted') throw new Error('expected refuted');
    expect(v.suggestedFix).toBe('check Y');
  });

  test('returns inconclusive for garbage output', async () => {
    const v = await verifyFinding({ finding: 'X', context: '', llm: fakeLlm('not json') });
    expect(v.status).toBe('inconclusive');
  });

  test('returns inconclusive for unknown status', async () => {
    const v = await verifyFinding({ finding: 'X', context: '', llm: fakeLlm('{"status":"maybe","reason":"idk"}') });
    expect(v.status).toBe('inconclusive');
  });
});

describe('runDynamicWorkflow', () => {
  const sampleWorkflow: DynamicWorkflow = {
    id: 'wf',
    originalPrompt: 'audit',
    createdAt: new Date().toISOString(),
    rationale: 'r',
    maxParallel: 4,
    estimatedTokenCost: 'medium',
    subtasks: [
      { id: 'a', role: 'researcher', title: 'A', prompt: 'do A', dependsOn: [], effort: 1 },
      { id: 'b', role: 'researcher', title: 'B', prompt: 'do B', dependsOn: ['a'], verifiedBy: 'v', effort: 1 },
      { id: 'v', role: 'verifier', title: 'V', prompt: 'verify B', dependsOn: [], effort: 1 },
    ],
  };

  test('runs all subtasks and tracks verifications', async () => {
    let progressCalls = 0;
    const result = await runDynamicWorkflow({
      workflow: sampleWorkflow,
      runSubtask: async s => ({ output: `output of ${s.id}` }),
      llm: async () => JSON.stringify({ status: 'confirmed', reason: 'looks good' }),
      onWaveProgress: async () => {
        progressCalls++;
      },
    });
    expect(result.results).toHaveLength(3);
    expect(progressCalls).toBe(2); // 2 waves
    const b = result.results.find(r => r.subtaskId === 'b')!;
    expect(b.verification).toBe('confirmed');
  });

  test('marks refuted results but does not throw', async () => {
    const result = await runDynamicWorkflow({
      workflow: sampleWorkflow,
      runSubtask: async s => ({ output: `output of ${s.id}` }),
      llm: async () => JSON.stringify({ status: 'refuted', reason: 'wrong', suggestedFix: 'do X' }),
    });
    const b = result.results.find(r => r.subtaskId === 'b')!;
    expect(b.verification).toBe('refuted');
    expect(result.refuted).toBe(1);
  });
});

describe('ultracode state machine', () => {
  test('initial state is disabled', () => {
    const s = createInitialUltracodeState();
    expect(s.enabled).toBe(false);
    expect(s.confirmedOnce).toBe(false);
    expect(s.workflowsStarted).toBe(0);
  });

  test('enable/disable flips the flag without losing other state', () => {
    const s = enableUltracode(markConfirmed(createInitialUltracodeState()));
    expect(s.enabled).toBe(true);
    expect(s.confirmedOnce).toBe(true);
    expect(disableUltracode(s).enabled).toBe(false);
  });

  test('records workflow starts', () => {
    const s = recordWorkflowStart(enableUltracode(createInitialUltracodeState()));
    expect(s.workflowsStarted).toBe(1);
  });

  test('confirmation requested only on the very first workflow', () => {
    const s = enableUltracode(createInitialUltracodeState());
    expect(shouldRequestConfirmation(s)).toBe(true);
    const after = markConfirmed(s);
    expect(shouldRequestConfirmation(after)).toBe(false);
    const afterStart = recordWorkflowStart(after);
    expect(shouldRequestConfirmation(afterStart)).toBe(false);
  });

  test('auto-trigger only fires when ultracode is on and prompt qualifies', () => {
    const s = enableUltracode(createInitialUltracodeState());
    expect(shouldAutoTriggerWorkflow({ state: s, prompt: 'fix this bug', explicitlyRequested: false })).toBe(false);
    expect(shouldAutoTriggerWorkflow({ state: s, prompt: 'migrate this entire service across all files end-to-end', explicitlyRequested: false })).toBe(true);
    expect(shouldAutoTriggerWorkflow({ state: s, prompt: 'fix', explicitlyRequested: true })).toBe(true);
    expect(shouldAutoTriggerWorkflow({ state: createInitialUltracodeState(), prompt: 'migrate everything', explicitlyRequested: false })).toBe(false);
  });

  test('confirmation prompt mentions the count and verifier count', () => {
    const text = formatConfirmationPrompt({
      subtasks: [
        { id: 'a', role: 'researcher', title: 'A', prompt: 'p', dependsOn: [], effort: 2 },
        { id: 'v1', role: 'verifier', title: 'V1', prompt: 'p', dependsOn: [], effort: 1 },
        { id: 'v2', role: 'verifier', title: 'V2', prompt: 'p', dependsOn: [], effort: 1 },
      ],
      estimatedTokenCost: 'high',
      rationale: 'test',
    });
    expect(text).toContain(ULTRACODE_GLYPH);
    expect(text).toContain('3 subtasks');
    expect(text).toContain('2 adversarial verifiers');
    expect(text).toContain('high');
  });
});
