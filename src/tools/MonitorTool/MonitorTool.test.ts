import { describe, expect, test } from 'bun:test';
import { MonitorTool } from './MonitorTool.js';

describe('MonitorTool input', () => {
  test('accepts task_id', () => {
    expect(MonitorTool.inputSchema.safeParse({ task_id: '123' }).success).toBe(true);
  });
  test('rejects missing task_id', () => {
    expect(MonitorTool.inputSchema.safeParse({} as any).success).toBe(false);
  });
});
