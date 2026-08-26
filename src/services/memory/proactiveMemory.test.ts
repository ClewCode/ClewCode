import { describe, expect, test } from 'bun:test';
import { extractContextTerms, filterConflictingFacts, type MemoryFact } from './proactiveMemory.js';

describe('extractContextTerms', () => {
  test('extracts file basenames and query terms', () => {
    const terms = extractContextTerms(
      ['src/utils/model/model.ts', 'src/services/ai/ProviderManager.ts'],
      'How to optimize memory and resolve race conditions',
    );

    expect(terms).toContain('model');
    expect(terms).toContain('providermanager');
    expect(terms).toContain('optimize');
    expect(terms).toContain('memory');
    expect(terms).toContain('conditions');
  });
});

describe('filterConflictingFacts', () => {
  test('filters out facts that contradict project rules', () => {
    const facts: MemoryFact[] = [
      { id: '1', category: 'architecture', summary: 'Use npm for package installs', relevanceScore: 2 },
      { id: '2', category: 'pattern', summary: 'Use ESM node: imports', relevanceScore: 3 },
    ];

    const activeRules = ['Never use npm for package installs, use bun instead'];
    const filtered = filterConflictingFacts(facts, activeRules);

    expect(filtered.length).toBe(1);
    expect(filtered[0]!.id).toBe('2');
  });
});
