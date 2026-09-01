import { describe, expect, test } from 'bun:test';
import { calculateAgentStats } from './UI.js';

/**
 * `result.output` is typed as an object, but is not one on every runtime path —
 * a failed or legacy tool result can carry a plain string. The `in` operator
 * throws on a primitive, so an unguarded `'totalTokens' in result.output` took
 * down the entire REPL render with:
 *
 *   output is not an Object. (evaluating '"totalTokens" in K.output')
 */
/** Builds a result whose `output` deliberately violates the declared type. */
const asResult = (output: unknown) => ({ param: {}, output }) as unknown as Parameters<typeof calculateAgentStats>[1];

describe('calculateAgentStats', () => {
  test('does not throw when output is a string', () => {
    expect(() => calculateAgentStats([], asResult('Agent finished with an error'))).not.toThrow();
    expect(calculateAgentStats([], asResult('Agent finished with an error')).tokens).toBeNull();
  });

  test('does not throw when output is a number', () => {
    expect(() => calculateAgentStats([], asResult(42))).not.toThrow();
    expect(calculateAgentStats([], asResult(42)).tokens).toBeNull();
  });

  test('uses the authoritative totalTokens when output carries one', () => {
    expect(calculateAgentStats([], asResult({ status: 'completed', totalTokens: 1234 })).tokens).toBe(1234);
  });

  test('ignores a zero or non-numeric totalTokens', () => {
    expect(calculateAgentStats([], asResult({ status: 'completed', totalTokens: 0 })).tokens).toBeNull();
    expect(calculateAgentStats([], asResult({ status: 'completed', totalTokens: 'lots' })).tokens).toBeNull();
  });

  test('handles a missing or empty result', () => {
    expect(calculateAgentStats([], undefined).tokens).toBeNull();
    expect(calculateAgentStats([], asResult(null)).tokens).toBeNull();
    expect(calculateAgentStats([], asResult({ status: 'completed' })).tokens).toBeNull();
  });

  test('reports no tool uses for an empty progress list', () => {
    expect(calculateAgentStats([], asResult({ status: 'completed' })).toolUseCount).toBe(0);
  });
});
