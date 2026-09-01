import { describe, expect, test } from 'bun:test';
import { ExitPlanModeV2Tool } from './ExitPlanModeV2Tool.js';

describe('ExitPlanModeTool input', () => {
  test('has inputSchema', () => {
    expect(ExitPlanModeV2Tool.inputSchema).toBeDefined();
    expect(typeof ExitPlanModeV2Tool.inputSchema.safeParse).toBe('function');
  });
  test('has correct name', () => {
    expect(typeof ExitPlanModeV2Tool.name).toBe('string');
  });
});
