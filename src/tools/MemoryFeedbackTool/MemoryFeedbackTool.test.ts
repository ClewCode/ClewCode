import { describe, expect, test } from 'bun:test';
import { MemoryFeedbackTool } from './MemoryFeedbackTool.js';

describe('MemoryFeedbackTool input', () => {
  test('has inputSchema', () => {
    expect(MemoryFeedbackTool.inputSchema).toBeDefined();
    expect(typeof MemoryFeedbackTool.inputSchema.safeParse).toBe('function');
  });
  test('has correct name', () => {
    expect(typeof MemoryFeedbackTool.name).toBe('string');
  });
});
