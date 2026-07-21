import { describe, expect, test } from 'bun:test';
import { describeContextOutcome, formatContextMeter, formatTokens, renderMeter } from './contextMeter.js';

describe('renderMeter', () => {
  test('fills proportionally', () => {
    expect(renderMeter(50, 10)).toBe('█████░░░░░');
  });

  test('is empty at 0% and full at 100%', () => {
    expect(renderMeter(0, 4)).toBe('░░░░');
    expect(renderMeter(100, 4)).toBe('████');
  });

  test('keeps one lit cell for a small non-zero value', () => {
    // 1% of 10 rounds to 0 — but "some context used" must not render as empty.
    expect(renderMeter(1, 10)).toBe('█░░░░░░░░░');
  });

  test('clamps out-of-range input', () => {
    expect(renderMeter(140, 4)).toBe('████');
    expect(renderMeter(-20, 4)).toBe('░░░░');
  });
});

describe('formatTokens', () => {
  test('abbreviates thousands', () => {
    expect(formatTokens(9200)).toBe('9.2k');
  });

  test('keeps small counts exact and never goes negative', () => {
    expect(formatTokens(840)).toBe('840');
    expect(formatTokens(-5)).toBe('0');
  });
});

describe('describeContextOutcome', () => {
  test('prefers a ready background summary over the generic message', () => {
    expect(describeContextOutcome({ kind: 'auto-compact', backgroundReady: true, backgroundRunning: false }, 9)).toBe(
      'summary ready',
    );
  });

  test('reports an in-flight background summary', () => {
    expect(describeContextOutcome({ kind: 'auto-compact', backgroundReady: false, backgroundRunning: true }, 9)).toBe(
      'preparing summary…',
    );
  });

  test('escalates wording at the brink', () => {
    expect(describeContextOutcome({ kind: 'auto-compact', backgroundReady: false, backgroundRunning: false }, 1)).toBe(
      'auto-compacting now',
    );
  });

  test('tells the user what to do when auto-compact is off', () => {
    expect(describeContextOutcome({ kind: 'manual' }, 9)).toBe('run /compact to free space');
  });
});

describe('formatContextMeter', () => {
  test('renders usage, headroom, and outcome in one line', () => {
    expect(
      formatContextMeter({
        percentLeft: 9,
        tokensLeft: 9200,
        mode: { kind: 'auto-compact', backgroundReady: false, backgroundRunning: false },
      }),
    ).toBe('Context █████████░ 91% · 9.2k left · auto-compacts at 80%');
  });
});
