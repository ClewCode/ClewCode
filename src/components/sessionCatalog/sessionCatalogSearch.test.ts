import { describe, expect, test } from 'bun:test';
import {
  createSessionSearchText,
  fuzzyMatch,
  matchesSearchText,
  matchSearchText,
  parseSearchQuery,
} from './sessionCatalogSearch.js';

describe('parseSearchQuery', () => {
  test('splits on whitespace', () => {
    expect(parseSearchQuery('fix auth').tokens).toEqual([
      { kind: 'fuzzy', value: 'fix' },
      { kind: 'fuzzy', value: 'auth' },
    ]);
  });

  test('quoted tokens become phrases', () => {
    expect(parseSearchQuery('"node cve" fix').tokens).toEqual([
      { kind: 'phrase', value: 'node cve' },
      { kind: 'fuzzy', value: 'fix' },
    ]);
  });

  test('an unclosed quote falls back to plain tokens', () => {
    expect(parseSearchQuery('"node cve').tokens).toEqual([
      { kind: 'fuzzy', value: 'node' },
      { kind: 'fuzzy', value: 'cve' },
    ]);
  });

  test('re: switches to regex mode', () => {
    const parsed = parseSearchQuery('re:^fix');
    expect(parsed.mode).toBe('regex');
    expect(parsed.regex?.source).toBe('^fix');
  });

  test('a broken regex is reported, not thrown', () => {
    expect(parseSearchQuery('re:[unclosed').error).toBeDefined();
  });
});

describe('matchSearchText', () => {
  test('an empty query matches everything', () => {
    expect(matchSearchText('anything', parseSearchQuery('')).matches).toBe(true);
  });

  test('every token must match', () => {
    expect(matchesSearchText('fix auth in gateway', 'fix gateway')).toBe(true);
    expect(matchesSearchText('fix auth in gateway', 'fix database')).toBe(false);
  });

  test('phrases match literally, not fuzzily', () => {
    expect(matchesSearchText('node cve triage', '"node cve"')).toBe(true);
    expect(matchesSearchText('node and cve', '"node cve"')).toBe(false);
  });

  test('fuzzy tokens match a subsequence', () => {
    expect(matchesSearchText('rebrand-extension', 'rbex')).toBe(true);
    expect(matchesSearchText('rebrand-extension', 'zzz')).toBe(false);
  });

  test('an unparseable query matches nothing', () => {
    expect(matchesSearchText('anything', 're:[unclosed')).toBe(false);
  });

  test('earlier matches score better', () => {
    const parsed = parseSearchQuery('auth');
    const early = matchSearchText('auth gateway', parsed).score;
    const late = matchSearchText('gateway rewrite for auth', parsed).score;
    expect(early).toBeLessThan(late);
  });
});

describe('fuzzyMatch', () => {
  test('a contiguous prefix scores zero', () => {
    expect(fuzzyMatch('reb', 'rebrand').score).toBe(0);
  });

  test('gaps cost more than depth', () => {
    expect(fuzzyMatch('rbd', 'rebrand').score).toBeGreaterThan(fuzzyMatch('reb', 'rebrand').score);
  });

  test('a missing letter fails', () => {
    expect(fuzzyMatch('rbz', 'rebrand').matches).toBe(false);
  });
});

describe('createSessionSearchText', () => {
  test('drops empty parts', () => {
    expect(createSessionSearchText(['fix auth', undefined, '', null, '/repo'])).toBe('fix auth /repo');
  });
});
