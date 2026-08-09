import { describe, expect, test } from 'bun:test';
import command from './index.js';

describe('/delegate command', () => {
  test('registers as local-jsx and loads call()', async () => {
    expect(command.type).toBe('local-jsx');
    expect(command.name).toBe('delegate');
    const mod = (await command.load()) as { call: unknown };
    expect(typeof mod.call).toBe('function');
  });
});
