import { describe, expect, test } from 'bun:test';
import command from './index.js';

describe('/capabilities command module', () => {
  test('lazy loader resolves the implementation module', async () => {
    const mod = await command.load();
    expect(typeof mod.call).toBe('function');
  });
});
