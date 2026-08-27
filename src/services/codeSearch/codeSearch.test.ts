/**
 * Tests for hybrid code search pure logic: FTS query builder, RRF fusion,
 * and result formatting. DB/embedding paths are exercised via /code-search.
 */

import { describe, expect, test } from 'bun:test';
import { fuseRRF, toFtsQuery } from './db.js';
import { formatResults, type HybridSearchResult } from './search.js';

describe('toFtsQuery', () => {
  test('splits tokens and ORs prefix terms', () => {
    expect(toFtsQuery('validate user input')).toBe('"validate"* OR "user"* OR "input"*');
  });

  test('drops punctuation and short tokens', () => {
    const q = toFtsQuery('foo-bar! a  is valid_name');
    expect(q).toContain('"foo"');
    expect(q).toContain('"bar"');
    expect(q).toContain('"valid_name"');
    expect(q).not.toContain('"a"');
  });

  test('caps at 12 tokens', () => {
    const q = toFtsQuery(Array.from({ length: 20 }, (_, i) => `tok${i}`).join(' '));
    expect(q.match(/"/g)!.length / 2).toBe(12);
  });

  test('empty/garbage input yields safe no-op query', () => {
    expect(toFtsQuery('')).toBe('""');
    expect(toFtsQuery('!!! @@@ ###')).toBe('""');
  });
});

describe('fuseRRF', () => {
  test('reinforces hits present in both legs', () => {
    const vec = [
      { id: 1, score: 0.9, rank: 1 },
      { id: 2, score: 0.8, rank: 2 },
    ];
    const fts = [
      { id: 2, score: 0.7, rank: 1 },
      { id: 3, score: 0.5, rank: 2 },
    ];
    const fused = fuseRRF(vec, fts);
    // id=2 appears in both lists → highest combined
    expect(fused.get(2)!).toBeGreaterThan(fused.get(1)!);
    expect(fused.get(2)!).toBeGreaterThan(fused.get(3)!);
  });

  test('standard RRF math: 1/(60+rank)', () => {
    const fused = fuseRRF([{ id: 5, score: 1, rank: 1 }], []);
    expect(fused.get(5)).toBeCloseTo(1 / 61, 6);
  });

  test('handles empty legs', () => {
    expect(fuseRRF([], []).size).toBe(0);
  });
});

describe('formatResults', () => {
  test('empty results message', () => {
    expect(formatResults([])).toContain('No matching code');
  });

  test('lists path, line, kind, name, scores', () => {
    const r: HybridSearchResult[] = [
      {
        id: 1,
        filePath: 'src/a.ts',
        startLine: 10,
        endLine: 10,
        name: 'foo',
        kind: 'function',
        signature: 'function foo()',
        vectorScore: 0.82,
        ftsScore: null,
        score: 0.016,
      },
    ];
    const out = formatResults(r);
    expect(out).toContain('src/a.ts:10');
    expect(out).toContain('function foo');
    expect(out).toContain('vec 82%');
  });
});
