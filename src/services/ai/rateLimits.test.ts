import { describe, expect, test } from 'bun:test';
import { extractRateLimitsFromHeaders, parseRetryAfter } from './rateLimits.js';

describe('Rate Limits Tracking', () => {
  test('extracts rate limit info from OpenAI response headers', () => {
    const headers = new Headers({
      'x-ratelimit-limit-requests': '10000',
      'x-ratelimit-remaining-requests': '9999',
      'x-ratelimit-reset-requests': '60s',
      'x-ratelimit-limit-tokens': '2000000',
      'x-ratelimit-remaining-tokens': '1999500',
      'x-ratelimit-reset-tokens': '3600s',
    });

    const limits = extractRateLimitsFromHeaders(headers);
    expect(limits.requests).toEqual({
      limit: 10000,
      remaining: 9999,
      resetSeconds: 60,
    });
    expect(limits.tokens).toEqual({
      limit: 2000000,
      remaining: 1999500,
      resetSeconds: 3600,
    });
  });

  test('parseRetryAfter handles seconds format', () => {
    expect(parseRetryAfter('60')).toBe(60000); // ms
    expect(parseRetryAfter('120')).toBe(120000);
  });

  test('parseRetryAfter handles date format', () => {
    const futureDate = new Date(Date.now() + 30000); // 30 seconds from now
    const result = parseRetryAfter(futureDate.toUTCString());
    expect(result).toBeGreaterThan(20000); // at least ~20 seconds
    expect(result).toBeLessThanOrEqual(30000);
  });

  test('parseRetryAfter clamps minimum to 1000ms', () => {
    expect(parseRetryAfter('0')).toBe(1000);
    expect(parseRetryAfter('0.5')).toBe(1000);
  });
});
