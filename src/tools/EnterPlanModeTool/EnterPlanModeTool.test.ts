import { describe, expect, test } from 'bun:test';
import { EnterPlanModeTool } from './EnterPlanModeTool.js';

describe('EnterPlanModeTool input', () => {
  test('has inputSchema', () => {
    expect(EnterPlanModeTool.inputSchema).toBeDefined();
    expect(typeof EnterPlanModeTool.inputSchema.safeParse).toBe('function');
  });
  test('has correct name', () => {
    expect(typeof EnterPlanModeTool.name).toBe('string');
  });
});
