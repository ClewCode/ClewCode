import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  calculateTokenWarningState,
  ERROR_THRESHOLD_BUFFER_TOKENS,
  getEffectiveContextWindowSize,
  WARNING_THRESHOLD_BUFFER_TOKENS,
} from './autoCompact.js';

describe('context-warning two-band thresholds', () => {
  // The yellow band only exists if the error threshold sits strictly closer to
  // the limit than the warning threshold. Equal buffers collapse them and make
  // the warning render red the instant it appears (regression guard).
  test('error buffer is strictly smaller than warning buffer', () => {
    expect(ERROR_THRESHOLD_BUFFER_TOKENS).toBeLessThan(WARNING_THRESHOLD_BUFFER_TOKENS);
  });

  describe('with auto-compact disabled (threshold = effective window)', () => {
    const model = 'claude-sonnet-5';
    let prev: string | undefined;

    beforeAll(() => {
      prev = process.env.DISABLE_AUTO_COMPACT;
      process.env.DISABLE_AUTO_COMPACT = '1';
    });
    afterAll(() => {
      if (prev === undefined) delete process.env.DISABLE_AUTO_COMPACT;
      else process.env.DISABLE_AUTO_COMPACT = prev;
    });

    test('usage inside the warning band is warning-but-not-error (yellow)', () => {
      const threshold = getEffectiveContextWindowSize(model);
      const usage = threshold - (WARNING_THRESHOLD_BUFFER_TOKENS + ERROR_THRESHOLD_BUFFER_TOKENS) / 2;
      const state = calculateTokenWarningState(usage, model);
      expect(state.isAboveWarningThreshold).toBe(true);
      expect(state.isAboveErrorThreshold).toBe(false);
    });

    test('usage past the error threshold is both (red)', () => {
      const threshold = getEffectiveContextWindowSize(model);
      const usage = threshold - ERROR_THRESHOLD_BUFFER_TOKENS / 2;
      const state = calculateTokenWarningState(usage, model);
      expect(state.isAboveWarningThreshold).toBe(true);
      expect(state.isAboveErrorThreshold).toBe(true);
    });

    test('usage below the warning threshold triggers neither', () => {
      const threshold = getEffectiveContextWindowSize(model);
      const usage = threshold - WARNING_THRESHOLD_BUFFER_TOKENS - 5_000;
      const state = calculateTokenWarningState(usage, model);
      expect(state.isAboveWarningThreshold).toBe(false);
      expect(state.isAboveErrorThreshold).toBe(false);
    });
  });
});
