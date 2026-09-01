import { describe, expect, test } from 'bun:test';
import { ComputerUseTool } from './ComputerUseTool.js';

describe('ComputerUseTool input', () => {
  test('has inputSchema', () => {
    expect(ComputerUseTool.inputSchema).toBeDefined();
    expect(typeof ComputerUseTool.inputSchema.safeParse).toBe('function');
  });
  test('has correct name', () => {
    expect(typeof ComputerUseTool.name).toBe('string');
  });
});
