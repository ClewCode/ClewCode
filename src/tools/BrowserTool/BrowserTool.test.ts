import { describe, expect, test } from 'bun:test';
import { BrowserTool } from './BrowserTool.js';

describe('BrowserTool input', () => {
  test('accepts navigate', () => {
    expect(BrowserTool.inputSchema.safeParse({ action: 'navigate', url: 'https://example.com' }).success).toBe(true);
  });
  test('rejects missing action', () => {
    expect(BrowserTool.inputSchema.safeParse({} as any).success).toBe(false);
  });
});
