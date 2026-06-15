import { describe, expect, test } from 'bun:test';
import { normalizeOpenAIToolInputSchema } from './AnthropicAdapter.js';

describe('normalizeOpenAIToolInputSchema', () => {
  test('keeps a plain object schema unchanged', () => {
    const input = { type: 'object', properties: { a: { type: 'string' } } };
    expect(normalizeOpenAIToolInputSchema(input)).toEqual(input);
  });

  test('forces type: object when missing on a non-union schema', () => {
    expect(normalizeOpenAIToolInputSchema({ properties: { a: { type: 'string' } } })).toEqual({
      type: 'object',
      properties: { a: { type: 'string' } },
    });
  });

  test('ensures type: object when anyOf is present', () => {
    // zod's z.union / z.discriminatedUnion produce { anyOf: [...] } at root.
    // Most providers (DeepSeek, OpenAI, OpenRouter) require type: "object".
    // Moonshot-specific stripping is handled in convertToOpenAI.
    const input = {
      anyOf: [
        { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] },
        { type: 'object', properties: { b: { type: 'number' } }, required: ['b'] },
      ],
      description: 'Read one or many files',
    };
    const out = normalizeOpenAIToolInputSchema(input);
    expect(out).toHaveProperty('type', 'object');
    expect(out.anyOf).toHaveLength(2);
    expect(out.description).toBe('Read one or many files');
  });

  test('ensures type: object when oneOf is present', () => {
    const input = {
      oneOf: [
        { type: 'object', properties: { a: { type: 'string' } } },
        { type: 'object', properties: { b: { type: 'number' } } },
      ],
    };
    const out = normalizeOpenAIToolInputSchema(input);
    expect(out).toHaveProperty('type', 'object');
    expect(Array.isArray(out.oneOf)).toBe(true);
  });

  test('returns a safe fallback for non-object input', () => {
    expect(normalizeOpenAIToolInputSchema(null)).toEqual({
      type: 'object',
      properties: {},
      additionalProperties: true,
    });
    expect(normalizeOpenAIToolInputSchema('nope')).toEqual({
      type: 'object',
      properties: {},
      additionalProperties: true,
    });
  });
});
