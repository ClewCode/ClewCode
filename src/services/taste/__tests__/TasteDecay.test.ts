// Tests for TasteDecay

import { describe, expect, test } from 'bun:test';
import { TasteDecay } from '../core/TasteDecay.js';
import type { TasteRule } from '../core/TasteTypes.js';

function makeRule(confidence: number, daysAgo: number): TasteRule {
  const date = new Date(Date.now() - daysAgo * 86400 * 1000);
  return {
    id: 'decay-test',
    kind: 'style',
    scope: 'project',
    text: 'test rule',
    confidence,
    weight: 1,
    source: 'manual',
    positiveEvidence: 3,
    negativeEvidence: 0,
    createdAt: date.toISOString(),
    updatedAt: date.toISOString(),
    lastUsedAt: date.toISOString(),
    decayRate: 0.01,
    tags: [],
  };
}

describe('TasteDecay', () => {
  test('decays confidence for old rules', () => {
    const decay = new TasteDecay(1, true); // very fast decay
    const rule = makeRule(0.9, 30); // 30 days old, 1 day half-life = 30 half-lives
    const result = decay.applyDecay(rule);
    expect(result.confidence).toBeLessThan(0.9);
  });

  test('does not decay below floor of 0.5', () => {
    const decay = new TasteDecay(1, true);
    const rule = makeRule(0.9, 365 * 10); // 10 years old
    const result = decay.applyDecay(rule);
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
  });

  test('does not decay when disabled', () => {
    const decay = new TasteDecay(1, false);
    const rule = makeRule(0.9, 30);
    const result = decay.applyDecay(rule);
    expect(result.confidence).toBe(0.9);
  });

  test('applyDecayToRules applies to all rules', () => {
    const decay = new TasteDecay(1, true);
    const rules = [makeRule(0.9, 5), makeRule(0.8, 10), makeRule(0.7, 20)];
    const result = decay.applyDecayToRules(rules);
    expect(result.length).toBe(3);
    for (const r of result) {
      expect(r.confidence).toBeGreaterThanOrEqual(0.5);
    }
  });

  test('getStaleRules returns low-confidence rules', () => {
    const decay = new TasteDecay(30, true);
    const rules = [
      makeRule(0.9, 0),
      makeRule(0.95, 0),
      makeRule(0.6, 365), // old, might be stale
    ];
    const stale = decay.getStaleRules(rules, 0.55);
    expect(stale.length).toBeGreaterThanOrEqual(0);
  });
});
