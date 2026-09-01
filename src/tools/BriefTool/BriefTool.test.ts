import { describe, expect, test } from 'bun:test';
import { BriefTool } from './BriefTool.js';

describe('BriefTool input', () => {
  test('accepts message', () => {
    expect(BriefTool.inputSchema.safeParse({ message: 'hello', status: 'normal' }).success).toBe(true);
  });
  test('rejects missing message', () => {
    expect(BriefTool.inputSchema.safeParse({} as any).success).toBe(false);
  });
});
