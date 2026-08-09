import { beforeEach, describe, expect, test } from 'bun:test';
import {
  compactHealthLine,
  getCompactHealth,
  recordCompaction,
  recordRestore,
  resetCompactHealth,
  shortfallWarning,
} from './health.js';

beforeEach(() => {
  resetCompactHealth();
});

const ok = {
  applied: ['dedupe'] as const,
  tokensFreed: 40_000,
  deficit: 30_000,
  shortfall: false,
  rationale: 'dedupe(~40k) covers 30k deficit',
};

const short = {
  applied: ['dedupe', 'stale-tool'] as const,
  tokensFreed: 12_000,
  deficit: 50_000,
  shortfall: true,
  rationale: 'dedupe(~8k) + stale-tool(~4k) short of 50k deficit',
};

describe('shortfallWarning', () => {
  test('stays silent until something actually goes wrong', () => {
    expect(shortfallWarning()).toBeNull();
    recordCompaction({ ...ok, applied: [...ok.applied] });
    expect(shortfallWarning()).toBeNull();
  });

  test('states how far short the compaction fell', () => {
    recordCompaction({ ...short, applied: [...short.applied] });
    const warning = shortfallWarning();
    expect(warning).toContain('12k');
    expect(warning).toContain('50k');
    expect(warning).toContain('38k short');
  });

  test('counts repeats so a session that keeps failing reads differently', () => {
    recordCompaction({ ...short, applied: [...short.applied] });
    expect(shortfallWarning()).not.toContain('this session');
    recordCompaction({ ...short, applied: [...short.applied] });
    expect(shortfallWarning()).toContain('2× this session');
  });

  test('clears once a later compaction succeeds', () => {
    recordCompaction({ ...short, applied: [...short.applied] });
    expect(shortfallWarning()).not.toBeNull();
    recordCompaction({ ...ok, applied: [...ok.applied] });
    // The warning is about the *current* state, not history — but the count
    // is retained for /context.
    expect(shortfallWarning()).toBeNull();
    expect(getCompactHealth().shortfallCount).toBe(1);
  });
});

describe('compactHealthLine', () => {
  test('is null before any compaction has run', () => {
    expect(compactHealthLine()).toBeNull();
  });

  test('reports count, what ran, and what it freed', () => {
    recordCompaction({ ...ok, applied: [...ok.applied] });
    const line = compactHealthLine();
    expect(line).toContain('1 compaction');
    expect(line).toContain('last: dedupe');
    expect(line).toContain('freed 40k');
  });

  test('joins multiple reducers in the order they ran', () => {
    recordCompaction({ ...short, applied: [...short.applied] });
    expect(compactHealthLine()).toContain('dedupe + stale-tool');
  });

  test('surfaces restores — the signal that replaced the regret loop', () => {
    recordCompaction({ ...ok, applied: [...ok.applied] });
    expect(compactHealthLine()).not.toContain('restored');
    recordRestore();
    recordRestore();
    expect(compactHealthLine()).toContain('2 restored');
  });

  test('surfaces shortfalls even after a later success', () => {
    recordCompaction({ ...short, applied: [...short.applied] });
    recordCompaction({ ...ok, applied: [...ok.applied] });
    expect(compactHealthLine()).toContain('1 shortfall');
    expect(compactHealthLine()).toContain('2 compactions');
  });
});
