import { describe, expect, test } from 'bun:test';
import { BashTool } from './BashTool.js';

describe('BashTool input validation', () => {
  test('accepts minimal command', () => {
    expect(BashTool.inputSchema.safeParse({ command: 'ls -la' }).success).toBe(true);
  });

  test('accepts command with description and timeout', () => {
    expect(
      BashTool.inputSchema.safeParse({
        command: 'npm test',
        description: 'Run tests',
        timeout: 5000,
      }).success,
    ).toBe(true);
  });

  test('rejects missing command', () => {
    expect(BashTool.inputSchema.safeParse({ description: 'no command' }).success).toBe(false);
  });

  test('rejects non-string command', () => {
    expect(BashTool.inputSchema.safeParse({ command: 123 }).success).toBe(false);
  });
});
