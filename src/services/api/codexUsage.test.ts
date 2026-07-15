import { afterEach, describe, expect, test } from 'bun:test';
import { extractCodexLimitsFromResponse, resetCodexLimits } from '../codexLimits.js';
import { getCodexUtilization } from './codexUsage.js';

function headers(init: Record<string, string>): Headers {
  return new Headers(init);
}

describe('getCodexUtilization', () => {
  afterEach(() => {
    resetCodexLimits();
  });

  test('returns null when no snapshot has been captured', () => {
    expect(getCodexUtilization()).toBeNull();
  });

  test('classifies windows by length, not by primary/secondary order', () => {
    // Weekly window arrives as `primary`, session window as `secondary`.
    extractCodexLimitsFromResponse(
      headers({
        'x-codex-primary-used-percent': '80',
        'x-codex-primary-window-minutes': '10080',
        'x-codex-secondary-used-percent': '12',
        'x-codex-secondary-window-minutes': '300',
      }),
    );

    const util = getCodexUtilization();
    expect(util?.five_hour?.utilization).toBe(12);
    expect(util?.seven_day?.utilization).toBe(80);
  });

  test('drops an all-zero inactive window (single-window plans)', () => {
    extractCodexLimitsFromResponse(
      headers({
        'x-codex-primary-used-percent': '40',
        'x-codex-primary-window-minutes': '300',
        'x-codex-secondary-used-percent': '0',
        'x-codex-secondary-window-minutes': '0',
      }),
    );

    const util = getCodexUtilization();
    expect(util?.five_hour?.utilization).toBe(40);
    expect(util?.seven_day).toBeUndefined();
  });

  test('reports utilization as 0-100, matching the RateLimit contract', () => {
    extractCodexLimitsFromResponse(
      headers({
        'x-codex-primary-used-percent': '77',
        'x-codex-primary-window-minutes': '300',
      }),
    );

    expect(getCodexUtilization()?.five_hour?.utilization).toBe(77);
  });
});
