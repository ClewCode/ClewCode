import { describe, expect, it } from 'bun:test';
import { extractTerms } from './explore.js';

describe('extractTerms', () => {
  it('keeps every name in a bare list of symbols', () => {
    // Relative order between two equally identifier-shaped names is not a contract.
    expect(extractTerms('PeerServer getOutputStyleConfig').sort()).toEqual(['PeerServer', 'getOutputStyleConfig']);
  });

  it('pulls identifiers out of a natural-language question and drops the prose', () => {
    const terms = extractTerms('how does getOutputStyleConfig persist across sessions?');
    expect(terms).toContain('getOutputStyleConfig');
    expect(terms).not.toContain('how');
    expect(terms).not.toContain('does');
  });

  it('ranks identifier-shaped tokens above bare lowercase words', () => {
    // "persist" survives (it is not a stopword) but must not outrank the identifier.
    const terms = extractTerms('why does getCanonicalName return null');
    expect(terms[0]).toBe('getCanonicalName');
  });

  it('recognises snake_case and PascalCase as identifiers', () => {
    expect(extractTerms('peer_registry')).toEqual(['peer_registry']);
    expect(extractTerms('LSPServerManager')).toEqual(['LSPServerManager']);
  });

  it('drops tokens shorter than three characters', () => {
    expect(extractTerms('is a b ok')).toEqual([]);
  });

  it('caps the number of terms so a long question cannot fan out unbounded', () => {
    const terms = extractTerms('alphaOne betaTwo gammaThree deltaFour epsilonFive zetaSix etaSeven');
    expect(terms.length).toBeLessThanOrEqual(4);
  });

  it('deduplicates repeated mentions', () => {
    const terms = extractTerms('setActiveMode calls setActiveMode');
    expect(terms.filter(t => t === 'setActiveMode')).toHaveLength(1);
  });

  it('returns nothing for a query with no usable tokens', () => {
    expect(extractTerms('what is this for?')).toEqual([]);
    expect(extractTerms('!!! ???')).toEqual([]);
  });

  it('strips punctuation around identifiers', () => {
    expect(extractTerms('where is `runExplore()` defined?')).toContain('runExplore');
  });
});
