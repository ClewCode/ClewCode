import { describe, expect, it } from 'bun:test';
import { formatTasteContext } from '../retrieval/formatter.js';
import { rankTasteRules, scoreTasteRule } from '../retrieval/scorer.js';
import type { TasteRule } from '../types.js';

describe('Taste Retrieval & Scoring', () => {
  const createMockRule = (overrides: Partial<TasteRule>): TasteRule => ({
    id: 'coding.rule-1',
    rule: 'Prefer explicit return types on TypeScript functions.',
    category: 'coding',
    scope: { type: 'project', language: 'typescript' },
    confidence: 0.9,
    status: 'active',
    source: 'explicit',
    evidenceCount: 4,
    positiveEvidence: 4,
    negativeEvidence: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastObservedAt: new Date().toISOString(),
    ...overrides,
  });

  it('ranks project-scoped rules higher than global rules', () => {
    const globalRule = createMockRule({
      id: 'rule-global',
      scope: { type: 'global' },
      confidence: 0.9,
    });
    const projectRule = createMockRule({
      id: 'rule-project',
      scope: { type: 'project' },
      confidence: 0.9,
    });

    const ranked = rankTasteRules([globalRule, projectRule]);
    expect(ranked[0]?.id).toBe('rule-project');
  });

  it('boosts relevance when task language matches rule scope', () => {
    const tsRule = createMockRule({
      id: 'rule-ts',
      scope: { type: 'project', language: 'typescript' },
    });
    const pyRule = createMockRule({
      id: 'rule-py',
      scope: { type: 'project', language: 'python' },
    });

    const scoreTs = scoreTasteRule(tsRule, { language: 'typescript' });
    const scorePy = scoreTasteRule(pyRule, { language: 'typescript' });

    expect(scoreTs.relevance).toBeGreaterThan(scorePy.relevance);
  });

  it('filters out disabled and conflicted rules from context ranking', () => {
    const activeRule = createMockRule({ id: 'active', status: 'active' });
    const disabledRule = createMockRule({ id: 'disabled', status: 'disabled' });
    const conflictedRule = createMockRule({ id: 'conflicted', status: 'conflicted' });

    const ranked = rankTasteRules([activeRule, disabledRule, conflictedRule]);
    expect(ranked.length).toBe(1);
    expect(ranked[0]?.id).toBe('active');
  });

  it('formats rules into clean XML context without database internals', () => {
    const rules = [
      createMockRule({ rule: 'Prefer minimal diffs.' }),
      createMockRule({ rule: 'Prefer named exports in TypeScript.' }),
    ];

    const formatted = formatTasteContext(rules);
    expect(formatted).not.toBeNull();
    expect(formatted).toContain('<clew_taste>');
    expect(formatted).toContain('1. Prefer minimal diffs.');
    expect(formatted).toContain('2. Prefer named exports in TypeScript.');
    expect(formatted).toContain('</clew_taste>');
    // Ensure no confidence or database IDs leaked
    expect(formatted).not.toContain('confidence');
    expect(formatted).not.toContain('evidenceCount');
  });
});
