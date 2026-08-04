import { describe, expect, test } from 'bun:test';
import { TASTE_APPLY_THRESHOLD } from './taste.js';

describe('TASTE_APPLY_THRESHOLD', () => {
  test('leaves room for a recorded-but-not-applied band', () => {
    // The band matters: an inference the agent is unsure about should be able
    // to accumulate evidence without steering behavior in the meantime.
    expect(TASTE_APPLY_THRESHOLD).toBeGreaterThan(0);
    expect(TASTE_APPLY_THRESHOLD).toBeLessThan(1);
  });

  test('sits above the range the prompt reserves for pure inference', () => {
    // prompt.ts tells the agent to use 0.5 for a behavioral guess, so a single
    // unconfirmed inference must not clear the bar on its own.
    expect(TASTE_APPLY_THRESHOLD).toBeGreaterThan(0.5);
  });
});
