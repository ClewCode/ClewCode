import { describe, expect, test } from 'bun:test';
import { ListMcpResourcesTool } from './ListMcpResourcesTool.js';

describe('ListMcpResourcesTool input', () => {
  test('has inputSchema', () => {
    expect(ListMcpResourcesTool.inputSchema).toBeDefined();
    expect(typeof ListMcpResourcesTool.inputSchema.safeParse).toBe('function');
  });
  test('has correct name', () => {
    expect(typeof ListMcpResourcesTool.name).toBe('string');
  });
});
