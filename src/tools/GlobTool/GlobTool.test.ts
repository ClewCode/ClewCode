import { describe, expect, it } from 'bun:test';
import { GlobTool } from './GlobTool.js';
import { GLOB_TOOL_NAME } from './prompt.js';

describe('GlobTool', () => {
  it('has correct tool name and attributes', () => {
    expect(GlobTool.name).toBe(GLOB_TOOL_NAME);
    expect(GlobTool.isReadOnly?.()).toBe(true);
    expect(GlobTool.isConcurrencySafe?.()).toBe(true);
  });

  it('validates input schema correctly', () => {
    const schema = GlobTool.inputSchema;
    expect(schema.safeParse({ pattern: '**/*.ts' }).success).toBe(true);
    expect(schema.safeParse({ pattern: '*.json', path: 'src' }).success).toBe(true);
    expect(schema.safeParse({}).success).toBe(false);
  });
});
