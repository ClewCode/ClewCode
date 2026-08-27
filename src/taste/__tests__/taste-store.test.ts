import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteTasteStore } from '../store/sqlite-taste-store.js';
import type { TasteRule } from '../types.js';

describe('Taste Store (SqliteTasteStore)', () => {
  let tempDir: string;
  let store: SqliteTasteStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'clew-taste-test-'));
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

  it('can upsert, get, and list project taste rules', async () => {
    const now = new Date().toISOString();
    const rule: TasteRule = {
      id: 'coding.named-exports',
      rule: 'Prefer named exports over default exports.',
      category: 'coding',
      scope: { type: 'project', language: 'typescript' },
      confidence: 0.95,
      status: 'active',
      source: 'explicit',
      evidenceCount: 5,
      positiveEvidence: 5,
      negativeEvidence: 0,
      createdAt: now,
      updatedAt: now,
      lastObservedAt: now,
    };

    await store.upsert(rule);

    const fetched = await store.get('coding.named-exports');
    expect(fetched).not.toBeNull();
    expect(fetched?.rule).toBe('Prefer named exports over default exports.');
    expect(fetched?.category).toBe('coding');
    expect(fetched?.scope.type).toBe('project');
    expect(fetched?.scope.language).toBe('typescript');
    expect(fetched?.confidence).toBe(0.95);

    const all = await store.list();
    expect(all.length).toBe(1);
    expect(all[0]?.id).toBe('coding.named-exports');
  });

  it('project rules override global rules with identical ID', async () => {
    const now = new Date().toISOString();
    const globalRule: TasteRule = {
      id: 'testing.framework',
      rule: 'Use Jest for testing.',
      category: 'testing',
      scope: { type: 'global' },
      confidence: 0.8,
      status: 'active',
      source: 'explicit',
      evidenceCount: 1,
      positiveEvidence: 1,
      negativeEvidence: 0,
      createdAt: now,
      updatedAt: now,
      lastObservedAt: now,
    };

    const projectRule: TasteRule = {
      id: 'testing.framework',
      rule: 'Use Bun test runner.',
      category: 'testing',
      scope: { type: 'project' },
      confidence: 1.0,
      status: 'active',
      source: 'explicit',
      evidenceCount: 3,
      positiveEvidence: 3,
      negativeEvidence: 0,
      createdAt: now,
      updatedAt: now,
      lastObservedAt: now,
    };

    await store.upsert(globalRule);
    await store.upsert(projectRule);

    const result = await store.get('testing.framework');
    expect(result?.rule).toBe('Use Bun test runner.');
    expect(result?.scope.type).toBe('project');

    const all = await store.list();
    expect(all.length).toBe(1);
    expect(all[0]?.rule).toBe('Use Bun test runner.');
  });

  it('can disable and enable taste rules', async () => {
    const now = new Date().toISOString();
    const rule: TasteRule = {
      id: 'workflow.minimal-diff',
      rule: 'Prefer minimal diffs.',
      category: 'workflow',
      scope: { type: 'project' },
      confidence: 0.9,
      status: 'active',
      source: 'explicit',
      evidenceCount: 2,
      positiveEvidence: 2,
      negativeEvidence: 0,
      createdAt: now,
      updatedAt: now,
      lastObservedAt: now,
    };

    await store.upsert(rule);

    const disabled = await store.disable('workflow.minimal-diff');
    expect(disabled).toBe(true);

    const ruleDisabled = await store.get('workflow.minimal-diff');
    expect(ruleDisabled?.status).toBe('disabled');

    const enabled = await store.enable('workflow.minimal-diff');
    expect(enabled).toBe(true);

    const ruleEnabled = await store.get('workflow.minimal-diff');
    expect(ruleEnabled?.status).toBe('active');
  });

  it('can remove and clear taste rules', async () => {
    const now = new Date().toISOString();
    const rule1: TasteRule = {
      id: 'tooling.biome',
      rule: 'Format code with Biome.',
      category: 'tooling',
      scope: { type: 'project' },
      confidence: 1.0,
      status: 'active',
      source: 'explicit',
      evidenceCount: 1,
      positiveEvidence: 1,
      negativeEvidence: 0,
      createdAt: now,
      updatedAt: now,
      lastObservedAt: now,
    };

    await store.upsert(rule1);
    expect(await store.get('tooling.biome')).not.toBeNull();

    const removed = await store.remove('tooling.biome');
    expect(removed).toBe(true);
    expect(await store.get('tooling.biome')).toBeNull();
  });
});
