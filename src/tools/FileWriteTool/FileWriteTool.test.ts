import { describe, expect, test } from 'bun:test';
import { FileWriteTool } from './FileWriteTool.js';

describe('FileWriteTool input validation', () => {
  test('accepts valid absolute path and content', () => {
    expect(
      FileWriteTool.inputSchema.safeParse({
        file_path: '/tmp/test.txt',
        content: 'hello world',
      }).success,
    ).toBe(true);
  });

  test('rejects missing file_path', () => {
    expect(FileWriteTool.inputSchema.safeParse({ content: 'hello' }).success).toBe(false);
  });

  test('rejects missing content', () => {
    expect(FileWriteTool.inputSchema.safeParse({ file_path: '/tmp/a.txt' }).success).toBe(false);
  });

  test('rejects relative path type still passes schema (runtime validates)', () => {
    // Schema only checks string, not absolute - should pass schema but fail at runtime
    expect(
      FileWriteTool.inputSchema.safeParse({
        file_path: 'relative/path.txt',
        content: 'x',
      }).success,
    ).toBe(true);
  });
});
