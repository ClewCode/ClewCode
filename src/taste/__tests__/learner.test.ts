import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TasteLearner } from '../learner/learner.js';
import { SqliteTasteStore } from '../store/sqlite-taste-store.js';

describe('TasteLearner Closed Loop', () => {
  let tempDir: string;
  let store: SqliteTasteStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'clew-learner-test-'));
    store = new SqliteTasteStore({
      projectDbPath: join(tempDir, 'project-taste.db'),
      globalDbPath: join(tempDir, 'global-taste.db'),
    });
  });

  afterEach(() => {
    store.close();
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('learns candidate rule from user edit and updates on repetition', async () => {
    const learner = new TasteLearner(store);

    const generated = 'export default function getUser() { return { id: 1 }; }';
    const edited = 'export function getUser() { return { id: 1 }; }';

    // 1st Task: User edits default export -> named export
    const result1 = await learner.learn({
      taskId: 'task_1',
      prompt: 'Create user helper',
      language: 'typescript',
      generatedPatch: generated,
      finalPatch: edited,
      userAction: 'edit',
      verifier: { tests: true, build: true, lint: true },
    });

    expect(result1.created.length).toBe(1);
    expect(result1.created[0]?.status).toBe('candidate');
    expect(result1.created[0]?.confidence).toBe(0.45);
    expect(result1.created[0]?.rule).toBe('Prefer named exports over default exports.');

    // 2nd Task: User again converts default export -> named export
    const result2 = await learner.learn({
      taskId: 'task_2',
      prompt: 'Create auth helper',
      language: 'typescript',
      generatedPatch: generated,
      finalPatch: edited,
      userAction: 'edit',
      verifier: { tests: true, build: true },
    });

    expect(result2.updated.length).toBe(1);
    // Confidence increased from 0.45 + 0.35 -> 0.80 (active)
    expect(result2.updated[0]?.confidence).toBeGreaterThanOrEqual(0.8);
    expect(result2.updated[0]?.status).toBe('active');
  });

  it('learns workflow habits from successful execution trajectories', async () => {
    const learner = new TasteLearner(store);

    const result = await learner.learn({
      taskId: 'task_search_flow',
      prompt: 'Locate and fix auth validation',
      toolSequence: ['GrepTool', 'FileReadTool', 'FileEditTool'],
      userAction: 'accept',
      verifier: { tests: true, build: true },
    });

    expect(result.created.some(r => r.category === 'workflow')).toBe(true);
    expect(result.created.some(r => r.rule.includes('searching and inspecting codebase'))).toBe(true);
  });

  it('detects and records contradictory rule conflicts', async () => {
    const learner = new TasteLearner(store);

    // Seed contradictory rules
    await store.upsert({
      id: 'language.named-exports',
      rule: 'Prefer named exports over default exports.',
      category: 'language',
      scope: { type: 'project' },
      confidence: 0.9,
      status: 'active',
      source: 'explicit',
      evidenceCount: 1,
      positiveEvidence: 1,
      negativeEvidence: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastObservedAt: new Date().toISOString(),
    });

    await store.upsert({
      id: 'language.default-exports',
      rule: 'Prefer default exports over named exports.',
      category: 'language',
      scope: { type: 'project' },
      confidence: 0.9,
      status: 'active',
      source: 'explicit',
      evidenceCount: 1,
      positiveEvidence: 1,
      negativeEvidence: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastObservedAt: new Date().toISOString(),
    });

    const result = await learner.learn({
      taskId: 'task_check_conflicts',
      prompt: 'Check conventions',
      userAction: 'accept',
    });

    expect(result.conflicts.length).toBeGreaterThan(0);
    expect(result.conflicts[0]?.reason).toContain('Contradictory export style');
  });
});
