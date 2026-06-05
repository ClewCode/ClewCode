// Tests for Taste1SymbolicEngine

import { describe, expect, test } from 'bun:test';
import { Taste1SymbolicEngine } from '../core/Taste1SymbolicEngine.js';
import type { TasteRule } from '../core/Taste1Types.js';

function makeRule(text: string, confidence: number, id = 'r1'): TasteRule {
  return {
    id,
    kind: 'style',
    scope: 'project',
    text,
    confidence,
    weight: 1,
    source: 'manual',
    positiveEvidence: 3,
    negativeEvidence: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    decayRate: 0.01,
    tags: [],
  };
}

describe('Taste1SymbolicEngine', () => {
  test('passes output that conforms to rule', () => {
    const engine = new Taste1SymbolicEngine(0.3, 0.85);
    const rules = [makeRule('use const', 0.9)];
    const result = engine.evaluate('const x = 5', rules);
    expect(result.constraints[0].passed).toBe(true);
    expect(result.blocked).toBe(false);
  });

  test('blocks output violating high-confidence rule', () => {
    const engine = new Taste1SymbolicEngine(0.3, 0.85);
    const rules = [makeRule('never use var', 0.95)];
    const result = engine.evaluate('var x = 5', rules);
    expect(result.blocked).toBe(true);
  });

  test('warns but does not block for medium-confidence rule', () => {
    const engine = new Taste1SymbolicEngine(0.3, 0.85);
    const rules = [makeRule('prefer arrow functions', 0.7)];
    const result = engine.evaluate('function foo() {}', rules);
    expect(result.blocked).toBe(false);
    expect(result.constraints[0].passed).toBe(true); // warn only
  });

  test('ignores low-confidence rules below minConfidence', () => {
    const engine = new Taste1SymbolicEngine(0.8, 0.85);
    const rules = [makeRule('use tabs', 0.6)];
    const result = engine.evaluate('use spaces', rules);
    expect(result.constraints.length).toBe(0);
  });

  test('returns summary with correct counts', () => {
    const engine = new Taste1SymbolicEngine(0.3, 0.85);
    const rules = [makeRule('use const', 0.9, 'r1'), makeRule('never use var', 0.95, 'r2')];
    const result = engine.evaluate('var x = 5', rules);
    expect(result.summary).toContain('blocked');
  });
});
