import { describe, expect, test } from 'bun:test';
import { MCPTool } from './MCPTool.js';

describe('MCPTool input', () => {
  test('has inputSchema', () => {
    expect(MCPTool.inputSchema).toBeDefined();
    expect(typeof MCPTool.inputSchema.safeParse).toBe('function');
  });
  test('has correct name', () => {
    expect(typeof MCPTool.name).toBe('string');
  });
});
