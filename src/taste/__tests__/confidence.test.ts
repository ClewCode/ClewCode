import { describe, expect, it } from 'bun:test';
import { deriveStatusFromConfidence, updateRuleConfidence } from '../learner/confidence.js';
import type { TasteRule } from '../types.js';

describe('Taste Confidence Engine & Lifecycle', () => {
  const createMockRule = (confidence: number, status: TasteRule['status'] = 'candidate'): TasteRule => ({
    id: 'test.rule',
    rule: 'Test rule',
    category: 'coding',
    scope: { type: 'project' },
    confidence,
    status,
    source: 'learned',
    evidenceCount: 1,
    positiveEvidence: 1,
    negativeEvidence: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastObservedAt: new Date().toISOString(),
  });

  it('correctly maps confidence thresholds to lifecycle status', () => {
    expect(deriveStatusFromConfidence(0.45)).toBe('candidate');
    expect(deriveStatusFromConfidence(0.65)).toBe('weak');
    expect(deriveStatusFromConfidence(0.85)).toBe('active');
  });

  it('preserves disabled and conflicted status regardless of confidence', () => {
    expect(deriveStatusFromConfidence(0.9, 'disabled')).toBe('disabled');
    expect(deriveStatusFromConfidence(0.9, 'conflicted')).toBe('conflicted');
  });

  it('promotes candidate to weak and active with repeated positive evidence', () => {
    const rule = createMockRule(0.45, 'candidate');

    // First positive evidence (+0.25) -> 0.70 (weak)
    const step1 = updateRuleConfidence(rule, 0.25, true);
    expect(step1.updatedRule.confidence).toBe(0.7);
    expect(step1.updatedRule.status).toBe('weak');

    // Second positive evidence (+0.15) -> 0.85 (active)
    const step2 = updateRuleConfidence(step1.updatedRule, 0.15, true);
    expect(step2.updatedRule.confidence).toBe(0.85);
    expect(step2.updatedRule.status).toBe('active');
  });

  it('weakens rule confidence with negative evidence', () => {
    const rule = createMockRule(0.85, 'active');

    // Negative evidence (e.g. user reject / revert)
    const step = updateRuleConfidence(rule, -0.3, false);
    expect(step.updatedRule.confidence).toBe(0.55);
    expect(step.updatedRule.status).toBe('candidate');
    expect(step.updatedRule.negativeEvidence).toBe(1);
  });
});
