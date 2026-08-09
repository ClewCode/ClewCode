import { describe, expect, test } from 'bun:test';
import { canFetchAfterDomainCheck } from './utils.js';

describe('WebFetch domain preflight', () => {
  test('fails open only when the advisory check is unavailable', () => {
    expect(canFetchAfterDomainCheck({ status: 'allowed' })).toBe(true);
    expect(canFetchAfterDomainCheck({ status: 'check_failed', error: new Error('timeout') })).toBe(true);
    expect(canFetchAfterDomainCheck({ status: 'blocked' })).toBe(false);
  });
});
