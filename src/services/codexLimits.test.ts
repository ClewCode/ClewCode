import { afterEach, describe, expect, it } from 'bun:test';
import {
  extractCodexLimitsFromResponse,
  getCodexLimits,
  parseCodexRateLimits,
  resetCodexLimits,
} from './codexLimits.js';

afterEach(() => resetCodexLimits());

function headers(entries: Record<string, string>): Headers {
  return new Headers(entries);
}

describe('extractCodexLimitsFromResponse — headers', () => {
  it('parses primary and secondary windows from headers', () => {
    const snap = extractCodexLimitsFromResponse(
      headers({
        'x-codex-primary-used-percent': '42',
        'x-codex-primary-resets-in-seconds': '3600',
        'x-codex-primary-window-minutes': '300',
        'x-codex-secondary-used-percent': '10',
        'x-codex-secondary-resets-in-seconds': '604800',
      }),
    );
    expect(snap?.primary?.usedPercent).toBe(42);
    expect(snap?.primary?.windowMinutes).toBe(300);
    // relative seconds resolved to an absolute future epoch
    expect(snap?.primary?.resetsAt).toBeGreaterThan(Date.now() / 1000);
    expect(snap?.secondary?.usedPercent).toBe(10);
    // stored as current snapshot
    expect(getCodexLimits()?.primary?.usedPercent).toBe(42);
  });

  it('tolerates a missing secondary window', () => {
    const snap = extractCodexLimitsFromResponse(headers({ 'x-codex-primary-used-percent': '5' }));
    expect(snap?.primary?.usedPercent).toBe(5);
    expect(snap?.secondary).toBeUndefined();
  });

  it('returns null when no known headers are present', () => {
    const snap = extractCodexLimitsFromResponse(headers({ 'content-type': 'application/json' }));
    expect(snap).toBeNull();
    expect(getCodexLimits()).toBeNull();
  });

  it('drops an all-zero secondary window (real Codex "plus" plan shape)', () => {
    // Captured live: this account has only a weekly window; secondary is 0/0/0.
    const snap = extractCodexLimitsFromResponse(
      headers({
        'x-codex-primary-used-percent': '12',
        'x-codex-primary-window-minutes': '10080',
        'x-codex-primary-reset-after-seconds': '604800',
        'x-codex-secondary-used-percent': '0',
        'x-codex-secondary-window-minutes': '0',
        'x-codex-secondary-reset-after-seconds': '0',
      }),
    );
    expect(snap?.primary?.usedPercent).toBe(12);
    expect(snap?.primary?.windowMinutes).toBe(10080);
    expect(snap?.secondary).toBeUndefined();
  });

  it('treats a large reset value as an absolute epoch timestamp', () => {
    const future = Math.floor(Date.now() / 1000) + 7200;
    const snap = extractCodexLimitsFromResponse(
      headers({ 'x-codex-primary-used-percent': '1', 'x-codex-primary-resets-in-seconds': String(future) }),
    );
    expect(snap?.primary?.resetsAt).toBe(future);
  });
});

describe('parseCodexRateLimits — SSE/body object', () => {
  it('parses a rate_limits object with snake_case fields', () => {
    const snap = parseCodexRateLimits({
      primary: { used_percent: 73, resets_in_seconds: 1800, window_minutes: 300 },
      secondary: { used_percent: 20, resets_in_seconds: 500000 },
    });
    expect(snap?.primary?.usedPercent).toBe(73);
    expect(snap?.secondary?.usedPercent).toBe(20);
  });

  it('parses camelCase and utilization aliases', () => {
    const snap = parseCodexRateLimits({ primary: { utilization: 88, resetsInSeconds: 60 } });
    expect(snap?.primary?.usedPercent).toBe(88);
  });

  it('returns null for garbage input', () => {
    expect(parseCodexRateLimits(null)).toBeNull();
    expect(parseCodexRateLimits('nope')).toBeNull();
    expect(parseCodexRateLimits({ primary: { foo: 1 } })).toBeNull();
  });
});

describe('extractCodexLimitsFromResponse — fallback ordering', () => {
  it('falls back to the rate_limits object when headers carry nothing', () => {
    const snap = extractCodexLimitsFromResponse(headers({ 'content-type': 'application/json' }), {
      primary: { used_percent: 33 },
    });
    expect(snap?.primary?.usedPercent).toBe(33);
  });

  it('never throws on malformed input', () => {
    expect(() => extractCodexLimitsFromResponse(null, undefined)).not.toThrow();
    expect(extractCodexLimitsFromResponse(null, undefined)).toBeNull();
  });
});
