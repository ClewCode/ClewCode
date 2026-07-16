import { describe, expect, test } from 'bun:test';
import { addStrictValidation } from './toolValidation.js';

describe('Tool Strict Validation', () => {
  test('adds strict: true to function tools', () => {
    const tools = [
      {
        type: 'function',
        function: {
          name: 'read_file',
          description: 'Read a file',
          parameters: { type: 'object', properties: { path: { type: 'string' } } },
        },
      },
    ];

    const result = addStrictValidation(tools);
    expect(result[0].function.strict).toBe(true);
  });

  test('preserves existing strict setting if already set', () => {
    const tools = [
      {
        type: 'function',
        function: {
          name: 'test',
          strict: false,
          parameters: { type: 'object' },
        },
      },
    ];

    const result = addStrictValidation(tools);
    expect(result[0].function.strict).toBe(false);
  });

  test('handles tools without function property gracefully', () => {
    const tools = [{ type: 'code_interpreter' as any }];
    const result = addStrictValidation(tools);
    expect(result[0]).toEqual(tools[0]);
  });
});
