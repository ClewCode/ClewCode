import { describe, expect, test } from 'bun:test';
import { PowerShellTool } from './PowerShellTool.js';

describe('PowerShellTool input', () => {
  test('has inputSchema', () => {
    expect(PowerShellTool.inputSchema).toBeDefined();
    expect(typeof PowerShellTool.inputSchema.safeParse).toBe('function');
  });
  test('has correct name', () => {
    expect(typeof PowerShellTool.name).toBe('string');
  });
});
