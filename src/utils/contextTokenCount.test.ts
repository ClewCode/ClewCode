import { expect, test } from 'bun:test';
import { countContextTokens } from './contextTokenCount.js';

test('unsupported token counting falls back locally without another request', async () => {
  let requests = 0;
  expect(
    await countContextTokens(async () => {
      requests++;
      throw new Error('count_tokens is unsupported');
    }),
  ).toBeNull();
  expect(requests).toBe(1);
});

test('preserves valid counts and rejects unusable counts', async () => {
  for (const count of [0, 29400]) expect(await countContextTokens(async () => count)).toBe(count);
  for (const count of [null, NaN, Infinity, -1]) expect(await countContextTokens(async () => count)).toBeNull();
});
