import { describe, expect, it } from 'bun:test';
import { GrepTool } from './GrepTool.js';
import { GREP_TOOL_NAME } from './prompt.js';

describe('GrepTool schema and attributes', () => {
  it('has correct tool name and attributes', () => {
    expect(GrepTool.name).toBe(GREP_TOOL_NAME);
    expect(GrepTool.isReadOnly?.()).toBe(true);
    expect(GrepTool.isConcurrencySafe?.()).toBe(true);
  });

  it('validates input schema with different output modes', () => {
    const schema = GrepTool.inputSchema;

    expect(schema.safeParse({ pattern: 'function' }).success).toBe(true);
    expect(
      schema.safeParse({
        pattern: 'function',
        output_mode: 'content',
        '-n': true,
        '-i': true,
        path: 'src',
      }).success,
    ).toBe(true);

    expect(
      schema.safeParse({
        pattern: 'class',
        output_mode: 'count',
      }).success,
    ).toBe(true);

    expect(schema.safeParse({}).success).toBe(false);
  });
});
