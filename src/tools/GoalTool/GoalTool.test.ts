import { describe, expect, test } from 'bun:test';
import { GoalTool } from './GoalTool.js';

describe('GoalTool input', () => {
  test('accepts set with goal', () => {
    expect(GoalTool.inputSchema.safeParse({ action: 'set', goal: 'fix build' }).success).toBe(true);
  });
  test('rejects invalid action', () => {
    expect(GoalTool.inputSchema.safeParse({ action: 'invalid' as any }).success).toBe(false);
  });
});
