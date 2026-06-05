// Tests for TastePromptInjector

import { describe, expect, test } from 'bun:test';
import type { TasteRule } from '../core/Taste1Types.js';
import { TastePromptInjector } from '../prompt/TastePromptInjector.js';

function makeRule(overrides: Partial<TasteRule> & { text: string; confidence: number }): TasteRule {
  return {
    id: `test-${Math.random().toString(36).slice(2, 8)}`,
    kind: 'style',
    scope: 'project',
    text: overrides.text,
    confidence: overrides.confidence,
    weight: 1,
    source: 'manual',
    positiveEvidence: 1,
    negativeEvidence: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    decayRate: 0.01,
    tags: [],
    ...overrides,
  };
}

describe('TastePromptInjector', () => {
  test('injects high-confidence rules', () => {
    const injector = new TastePromptInjector(8, 0.55);
    const rules = [makeRule({ text: 'Use const instead of let', confidence: 0.9 })];
    const result = injector.buildInjection(rules);
    expect(result).not.toBeNull();
    expect(result).toContain('Use const instead of let');
    expect(result).toContain('<clew_taste1>');
    expect(result).toContain('</clew_taste1>');
  });

  test('filters low-confidence rules', () => {
    const injector = new TastePromptInjector(8, 0.55);
    const rules = [makeRule({ text: 'Maybe use arrow functions', confidence: 0.3 })];
    const result = injector.buildInjection(rules);
    expect(result).toBeNull();
  });

  test('returns null for empty rules', () => {
    const injector = new TastePromptInjector(8, 0.55);
    expect(injector.buildInjection([])).toBeNull();
  });

  test('respects maxInjectedRules', () => {
    const injector = new TastePromptInjector(2, 0.4);
    const rules = [
      makeRule({ text: 'Rule 1', confidence: 0.9 }),
      makeRule({ text: 'Rule 2', confidence: 0.9 }),
      makeRule({ text: 'Rule 3', confidence: 0.9 }),
    ];
    const result = injector.buildInjection(rules);
    const lines = result!.split('\n');
    const ruleLines = lines.filter(l => /^\d+\./.test(l));
    expect(ruleLines.length).toBeLessThanOrEqual(2);
  });

  test('builds constraint block for high-confidence rules', () => {
    const injector = new TastePromptInjector(8, 0.55);
    const rules = [
      makeRule({ text: 'Never use any', confidence: 0.9 }),
      makeRule({ text: 'Maybe use interfaces', confidence: 0.6 }),
    ];
    const constraints = injector.buildConstraints(rules);
    expect(constraints).not.toBeNull();
    expect(constraints).toContain('Never use any');
    expect(constraints).not.toContain('Maybe use interfaces');
    expect(constraints).toContain('<clew_taste1_constraints>');
  });

  test('filters inferred rules with low evidence', () => {
    const injector = new TastePromptInjector(8, 0.55);
    const rules = [
      makeRule({ text: 'Prefer functional style', confidence: 0.7, source: 'inferred', positiveEvidence: 0 }),
    ];
    const result = injector.buildInjection(rules);
    expect(result).toBeNull();
  });
});
