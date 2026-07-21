import { describe, expect, test } from 'bun:test';
import {
  formatSessionAge,
  formatTokenCount,
  RESUME_WARNING_AGE_MS,
  RESUME_WARNING_TOKEN_THRESHOLD,
  shouldWarnBeforeResume,
} from './resumeSizeWarning.js';

describe('formatSessionAge', () => {
  test('formats hours and minutes like the picker', () => {
    expect(formatSessionAge((17 * 60 + 27) * 60_000)).toBe('17h 27m');
  });

  test('drops the hour segment under an hour', () => {
    expect(formatSessionAge(42 * 60_000)).toBe('42m');
  });

  test('switches to days past 24h', () => {
    expect(formatSessionAge((2 * 24 * 60 + 3 * 60) * 60_000)).toBe('2d 3h');
  });

  test('clamps negative clock skew to zero', () => {
    expect(formatSessionAge(-5000)).toBe('0m');
  });
});

describe('formatTokenCount', () => {
  test('abbreviates thousands to one decimal', () => {
    expect(formatTokenCount(128_700)).toBe('128.7k');
  });

  test('leaves sub-1k counts plain', () => {
    expect(formatTokenCount(842)).toBe('842');
  });
});

describe('shouldWarnBeforeResume', () => {
  test('warns on a large but recent session', () => {
    expect(shouldWarnBeforeResume({ tokens: RESUME_WARNING_TOKEN_THRESHOLD, ageMs: 0 })).toBe(true);
  });

  test('warns on an old but small session', () => {
    expect(shouldWarnBeforeResume({ tokens: 1000, ageMs: RESUME_WARNING_AGE_MS })).toBe(true);
  });

  test('stays quiet for a small recent session', () => {
    expect(shouldWarnBeforeResume({ tokens: 1000, ageMs: 60_000 })).toBe(false);
  });
});
