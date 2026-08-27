import { describe, expect, it } from 'bun:test';
import { analyzeSemanticDiff } from '../learner/diff-analyzer.js';

describe('Semantic Diff Analyzer', () => {
  it('detects default export to named export conversion', () => {
    const before = `
export default function createUser(name) {
  return { id: 1, name };
}
`;
    const after = `
export function createUser(name) {
  return { id: 1, name };
}
`;
    const patterns = analyzeSemanticDiff(before, after, 'typescript');
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns[0]?.rule).toBe('Prefer named exports over default exports.');
    expect(patterns[0]?.category).toBe('language');
  });

  it('detects addition of explicit TypeScript return types', () => {
    const before = `
export function computeTotal(items) {
  return items.reduce((a, b) => a + b, 0);
}
`;
    const after = `
export function computeTotal(items: number[]): number {
  return items.reduce((a, b) => a + b, 0);
}
`;
    const patterns = analyzeSemanticDiff(before, after, 'typescript');
    expect(patterns.some(p => p.rule.includes('explicit return types'))).toBe(true);
  });

  it('detects trimming down broad refactor into minimal surgical diff', () => {
    const lines: string[] = [];
    for (let i = 0; i < 40; i++) {
      lines.push(`const line_${i} = ${i};`);
    }
    const before = lines.join('\n');
    const after = 'const simpleFix = true;';

    const patterns = analyzeSemanticDiff(before, after);
    expect(patterns.some(p => p.rule.includes('minimal, surgical diffs'))).toBe(true);
  });
});
