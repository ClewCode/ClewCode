import { describe, expect, test } from 'bun:test';
import { firstPartyNameToCanonical, getCanonicalName } from './canonicalModelName.js';

describe('canonical model names', () => {
  test('normalizes dated first-party model IDs without importing the full model resolver', () => {
    expect(firstPartyNameToCanonical('claude-3-5-haiku-20241022')).toBe('claude-3-5-haiku');
    expect(firstPartyNameToCanonical('claude-sonnet-4-6-20250514')).toBe('claude-sonnet-4-6');
  });

  test('keeps unknown model IDs stable', () => {
    expect(getCanonicalName('custom-deployment-A')).toBe('custom-deployment-a');
  });
});
