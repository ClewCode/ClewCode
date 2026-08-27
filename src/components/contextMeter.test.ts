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
    expect(
      describeContextOutcome({
        kind: 'auto-compact',
        backgroundReady: true,
        backgroundRunning: false,
        triggerPercent: 70,
        triggered: false,
      }),
    ).toBe('summary ready');
  });

  test('reports an in-flight background summary', () => {
    expect(
      describeContextOutcome({
        kind: 'auto-compact',
        backgroundReady: false,
        backgroundRunning: true,
        triggerPercent: 70,
        triggered: false,
      }),
    ).toBe('preparing summary…');
  });

  test('reports the real trigger and pending state', () => {
    expect(
      describeContextOutcome({
        kind: 'auto-compact',
        backgroundReady: false,
        backgroundRunning: false,
        triggerPercent: 70,
        triggered: false,
      }),
    ).toBe('auto-compacts at 70%');
    expect(
      describeContextOutcome({
        kind: 'auto-compact',
        backgroundReady: false,
        backgroundRunning: false,
        triggerPercent: 70,
        triggered: true,
      }),
    ).toBe('auto-compact pending');
  });

  test('tells the user what to do when auto-compact is off', () => {
    expect(describeContextOutcome({ kind: 'manual' })).toBe('run /compact to free space');
  });
});

describe('formatContextMeter', () => {
  test('renders usage, headroom, and outcome in one line', () => {
    expect(
      formatContextMeter({
        percentUsed: 60,
        tokensLeft: 19_800,
        mode: {
          kind: 'auto-compact',
          backgroundReady: false,
          backgroundRunning: false,
          triggerPercent: 70,
          triggered: false,
        },
      }),
    ).toBe('Context ██████░░░░ 60% · 19.8k left · auto-compacts at 70%');
  });
});
