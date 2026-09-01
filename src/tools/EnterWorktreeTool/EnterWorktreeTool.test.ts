import { describe, expect, test } from 'bun:test';
import { EnterWorktreeTool } from './EnterWorktreeTool.js';

describe('EnterWorktreeTool input', () => {
  test('has inputSchema', () => {
    expect(EnterWorktreeTool.inputSchema).toBeDefined();
    expect(typeof EnterWorktreeTool.inputSchema.safeParse).toBe('function');
  });
  test('has correct name', () => {
    expect(typeof EnterWorktreeTool.name).toBe('string');
  });
});
