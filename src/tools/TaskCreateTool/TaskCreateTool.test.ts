import { describe, expect, test } from 'bun:test';
import { TaskCreateTool } from './TaskCreateTool.js';

describe('TaskCreateTool input compatibility', () => {
  test('accepts completion by subject from legacy model payloads', () => {
    expect(
      TaskCreateTool.inputSchema.safeParse({
        subject: 'Build agent identity',
        action: 'complete',
      }).success,
    ).toBe(true);
  });

  test('accepts creation without a duplicated description', () => {
    expect(TaskCreateTool.inputSchema.safeParse({ subject: 'Build agent identity' }).success).toBe(true);
  });

  test('rejects unknown actions', () => {
    expect(TaskCreateTool.inputSchema.safeParse({ subject: 'Build agent identity', action: 'delete' }).success).toBe(
      false,
    );
  });
});
