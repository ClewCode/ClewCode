import { expect, test } from 'bun:test';
import { normalizeLegacyProfile } from './settings.js';

test('removes the legacy personal profile setting', () => {
  expect(normalizeLegacyProfile({ profile: 'personal', theme: 'dark' })).toEqual({
    theme: 'dark',
  });
});

test('removes the legacy coding profile setting', () => {
  expect(normalizeLegacyProfile({ profile: 'coding', theme: 'dark' })).toEqual({
    theme: 'dark',
  });
});

test('does not rewrite unrelated settings', () => {
  const settings = { theme: 'dark' };
  expect(normalizeLegacyProfile(settings)).toBe(settings);
});
