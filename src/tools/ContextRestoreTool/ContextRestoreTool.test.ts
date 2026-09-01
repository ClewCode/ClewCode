import { describe, expect, test } from 'bun:test';
import { ContextRestoreTool } from './ContextRestoreTool.js';

describe('ContextRestoreTool input', () => {
  test('has inputSchema', () => {
    expect(ContextRestoreTool.inputSchema).toBeDefined();
    expect(typeof ContextRestoreTool.inputSchema.safeParse).toBe('function');
  });
  test('has correct name', () => {
    expect(typeof ContextRestoreTool.name).toBe('string');
  });
});
