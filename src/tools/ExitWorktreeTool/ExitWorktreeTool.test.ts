import { describe, expect, test } from 'bun:test';
import { ExitWorktreeTool } from './ExitWorktreeTool.js';

describe('ExitWorktreeTool input', () => {
  test('has inputSchema', () => {
    expect(ExitWorktreeTool.inputSchema).toBeDefined();
    expect(typeof ExitWorktreeTool.inputSchema.safeParse).toBe('function');
  });
  test('has correct name', () => {
    expect(typeof ExitWorktreeTool.name).toBe('string');
  });
});
