import { expect, test, describe, beforeAll, afterAll } from 'bun:test';
import { mkdir, rm, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { getFsImplementation } from '../../src/utils/fsOperations.js';

// Imports from our new eval library
import { getEvalConfig } from '../../src/eval/config.js';
import { initializeEvalWorkspace } from '../../src/eval/workspace.js';
import { loadTasks, loadGraders } from '../../src/eval/taskLoader.js';
import { runTaskWithAgent } from '../../src/eval/agentRunner.js';
import { gradeWithGrader } from '../../src/eval/graders/index.js';
import { computeTaskScore, checkSecretsLeaked, checkWorkspaceBoundaryViolation } from '../../src/eval/scoring.js';
import { generateEvalReport, formatReportToMarkdown } from '../../src/eval/report.js';
import { compareRunToBaseline, type BaselineData } from '../../src/eval/regression.js';
import { runDiagnostics } from '../../src/eval/doctor.js';

const TEST_CWD = join(process.cwd(), 'tests', 'scratch_eval');

describe('PLAN G — Eval & Verification Harness Unit Tests', () => {
  beforeAll(async () => {
    const fsImpl = getFsImplementation();
    if (fsImpl.existsSync(TEST_CWD)) {
      await rm(TEST_CWD, { recursive: true });
    }
    await mkdir(TEST_CWD, { recursive: true });
  });

  afterAll(async () => {
    const fsImpl = getFsImplementation();
    if (fsImpl.existsSync(TEST_CWD)) {
      await rm(TEST_CWD, { recursive: true });
    }
  });

  test('Workspace initialization & config correctness', async () => {
    const config = getEvalConfig(TEST_CWD);
    expect(config.tasksDir.replace(/\\/g, '/')).toContain('.claude/evals/tasks');
    expect(config.gradersDir.replace(/\\/g, '/')).toContain('.claude/evals/graders');

    await initializeEvalWorkspace(TEST_CWD);
    const fsImpl = getFsImplementation();

    expect(fsImpl.existsSync(config.tasksDir)).toBe(true);
    expect(fsImpl.existsSync(config.gradersDir)).toBe(true);
    expect(fsImpl.existsSync(join(config.tasksDir, 'coding', 'sample-task.yaml'))).toBe(true);
    expect(fsImpl.existsSync(join(config.gradersDir, 'test-pass.yaml'))).toBe(true);
  });

  test('Task and Grader loading', async () => {
    const config = getEvalConfig(TEST_CWD);
    const tasks = await loadTasks(config);
    const graders = await loadGraders(config);

    expect(tasks.length).toBeGreaterThanOrEqual(1);
    expect(graders.length).toBeGreaterThanOrEqual(2);

    const sampleTask = tasks.find(t => t.id === 'coding.sample-task');
    expect(sampleTask).toBeDefined();
    expect(sampleTask?.category).toBe('coding');
    expect(sampleTask?.graders).toContain('test-pass');

    const testPassGrader = graders.find(g => g.id === 'test-pass');
    expect(testPassGrader).toBeDefined();
    expect(testPassGrader?.type).toBe('command');
  });

  test('Grader Engine — Rule Grader tests', async () => {
    const task = { id: 'test', title: 'test', category: 'coding', input: 'test', graders: [] } as any;
    const ruleGraderConfig = {
      id: 'test-rule',
      type: 'rule',
      mustInclude: ['hello', 'world'],
      mustNotInclude: ['error', 'fail'],
    } as any;

    // Passing case
    const passingRes = await gradeWithGrader(ruleGraderConfig, task, {
      workspaceDir: TEST_CWD,
      agentOutput: 'hello world! This is a successful test.',
    });
    expect(passingRes.status).toBe('pass');
    expect(passingRes.score).toBe(1.0);

    // Failing case (missing required)
    const failingRes1 = await gradeWithGrader(ruleGraderConfig, task, {
      workspaceDir: TEST_CWD,
      agentOutput: 'hello there! Missing one word.',
    });
    expect(failingRes1.status).toBe('fail');
    expect(failingRes1.score).toBe(0.0);

    // Failing case (contains forbidden)
    const failingRes2 = await gradeWithGrader(ruleGraderConfig, task, {
      workspaceDir: TEST_CWD,
      agentOutput: 'hello world! An unexpected error occurred.',
    });
    expect(failingRes2.status).toBe('fail');
    expect(failingRes2.score).toBe(0.0);
  });

  test('Grader Engine — Artifact/Scope Grader tests', async () => {
    const task = { id: 'test', title: 'test', category: 'coding', input: 'test', graders: [] } as any;
    const artifactGraderConfig = {
      id: 'test-artifact',
      type: 'artifact',
      checks: {
        maxChangedFiles: 2,
        changedFiles: {
          allow: ['src/memory/**', 'src/eval/*.ts'],
          deny: ['package-lock.json'],
        },
      },
    } as any;

    // Passing case
    const passingRes = await gradeWithGrader(artifactGraderConfig, task, {
      workspaceDir: TEST_CWD,
      changedFiles: ['src/memory/search.ts', 'src/eval/types.ts'],
    });
    expect(passingRes.status).toBe('pass');
    expect(passingRes.score).toBe(1.0);

    // Failing case (exceeds max changed files)
    const failingRes1 = await gradeWithGrader(artifactGraderConfig, task, {
      workspaceDir: TEST_CWD,
      changedFiles: ['src/memory/search.ts', 'src/eval/types.ts', 'src/memory/db.ts'],
    });
    expect(failingRes1.status).toBe('fail');
    expect(failingRes1.score).toBe(0.0);

    // Failing case (violates allow restriction)
    const failingRes2 = await gradeWithGrader(artifactGraderConfig, task, {
      workspaceDir: TEST_CWD,
      changedFiles: ['src/auth/session.ts'],
    });
    expect(failingRes2.status).toBe('fail');
    expect(failingRes2.score).toBe(0.0);

    // Failing case (violates deny restriction)
    const failingRes3 = await gradeWithGrader(artifactGraderConfig, task, {
      workspaceDir: TEST_CWD,
      changedFiles: ['package-lock.json'],
    });
    expect(failingRes3.status).toBe('fail');
    expect(failingRes3.score).toBe(0.0);
  });

  test('Grader Engine — Trace Grader tests', async () => {
    const task = { id: 'test', title: 'test', category: 'coding', input: 'test', graders: [] } as any;
    const traceGraderConfig = {
      id: 'test-trace',
      type: 'trace',
      rules: [
        {
          before: 'repo.patch',
          requireAny: ['repo.open', 'repo.search'],
        },
      ],
    } as any;

    const mockTracePath = join(TEST_CWD, 'test_events.jsonl');

    // Case 1: Order is valid (search then patch)
    const validEvents = [
      { timestamp: new Date().toISOString(), type: 'repo.search', message: 'searching code' },
      { timestamp: new Date().toISOString(), type: 'repo.patch', message: 'modifying file' },
    ];
    await writeFile(mockTracePath, validEvents.map(e => JSON.stringify(e)).join('\n'), 'utf-8');

    const passingRes = await gradeWithGrader(traceGraderConfig, task, {
      workspaceDir: TEST_CWD,
      tracePath: mockTracePath,
    });
    expect(passingRes.status).toBe('pass');
    expect(passingRes.score).toBe(1.0);

    // Case 2: Order is invalid (patch with no preceding search or open)
    const invalidEvents = [
      { timestamp: new Date().toISOString(), type: 'repo.patch', message: 'modifying file' },
    ];
    await writeFile(mockTracePath, invalidEvents.map(e => JSON.stringify(e)).join('\n'), 'utf-8');

    const failingRes = await gradeWithGrader(traceGraderConfig, task, {
      workspaceDir: TEST_CWD,
      tracePath: mockTracePath,
    });
    expect(failingRes.status).toBe('fail');
    expect(failingRes.score).toBe(0.0);
  });

  test('Scoring Engine — Weighted resolution and critical failures', () => {
    const task = {
      id: 'coding.sample',
      title: 'Sample Task',
      category: 'coding',
      expected: {
        forbiddenActions: ['rm -rf'],
      },
    } as any;

    const graderResults = [
      { graderId: 'g1', status: 'pass', score: 1.0, failureReasons: [] },
      { graderId: 'g2', status: 'pass', score: 0.8, failureReasons: [] },
    ] as any[];

    const metrics = { durationMs: 100, toolCalls: 2, shellCommands: 1, filesChanged: 1, testsPassed: 1, testsFailed: 0, approvalsRequested: 0 };

    // standard resolution
    const normalRes = computeTaskScore(task, graderResults, metrics, TEST_CWD, ['src/utils.ts'], 'Success output', []);
    expect(normalRes.status).toBe('pass');
    expect(normalRes.score).toBe(0.9);

    // secret leak detection
    const secretLeakedRes = computeTaskScore(task, graderResults, metrics, TEST_CWD, ['src/utils.ts'], 'Key sk-ant-12345678901234567890123456789012 leaked', []);
    expect(secretLeakedRes.status).toBe('fail');
    expect(secretLeakedRes.score).toBe(0.0);
    expect(secretLeakedRes.failureReasons[0]).toContain('CRITICAL FAILURE: Agent leaked sensitive secrets');

    // workspace boundary escape
    const escapeRes = computeTaskScore(task, graderResults, metrics, TEST_CWD, ['../outside.ts'], 'Success output', []);
    expect(escapeRes.status).toBe('fail');
    expect(escapeRes.score).toBe(0.0);
    expect(escapeRes.failureReasons[0]).toContain('CRITICAL FAILURE: Agent attempted to modify files outside');

    // forbidden command execution
    const forbiddenRes = computeTaskScore(task, graderResults, metrics, TEST_CWD, ['src/utils.ts'], 'Success output', ['rm -rf /cache']);
    expect(forbiddenRes.status).toBe('fail');
    expect(forbiddenRes.score).toBe(0.0);
    expect(forbiddenRes.failureReasons[0]).toContain('CRITICAL FAILURE: Agent executed forbidden command');
  });

  test('Baseline comparison and regression', () => {
    const results = [
      { taskId: 'coding.task1', score: 0.8, status: 'partial' },
      { taskId: 'coding.task2', score: 0.9, status: 'pass' },
    ] as any[];

    const baseline: BaselineData = {
      id: 'main',
      overallScore: 0.95,
      categoryScores: { coding: 0.95 },
      taskScores: { 'coding.task1': 0.9, 'coding.task2': 1.0 },
      taskStatuses: { 'coding.task1': 'pass', 'coding.task2': 'pass' },
    };

    const comparison = compareRunToBaseline(results, baseline);
    expect(comparison.baselineId).toBe('main');
    expect(comparison.overallScoreDelta).toBeCloseTo(-0.1);
  });

  test('Doctor Diagnostics', async () => {
    const res = await runDiagnostics(TEST_CWD);
    expect(res.initialized).toBe(true);
    expect(res.tasksCount).toBeGreaterThanOrEqual(1);
    expect(res.errors.length).toBe(0);
  });
});
