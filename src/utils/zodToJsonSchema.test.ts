import { describe, expect, test } from 'bun:test';
import { z } from 'zod/v4';
import { ensureObjectRootSchema, zodToJsonSchema } from './zodToJsonSchema.js';

describe('zodToJsonSchema', () => {
  test('adds an object root to plain tool schemas that omit type', () => {
    expect(ensureObjectRootSchema({ properties: { query: { type: 'string' } }, required: ['query'] })).toEqual({
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    });
  });

  test('flattens a top-level oneOf into an Anthropic-compatible object schema', () => {
    expect(
      ensureObjectRootSchema({
        oneOf: [
          {
            type: 'object',
            properties: { kind: { const: 'file' }, path: { type: 'string' } },
            required: ['kind', 'path'],
          },
          {
            type: 'object',
            properties: { kind: { const: 'url' }, url: { type: 'string' } },
            required: ['kind', 'url'],
          },
        ],
      }),
    ).toEqual({
      type: 'object',
      properties: {
        kind: { anyOf: [{ const: 'file' }, { const: 'url' }] },
        path: { type: 'string' },
        url: { type: 'string' },
      },
      required: ['kind'],
    });
  });

  test('converts simple string schema', () => {
    const schema = z.string();
    const result = zodToJsonSchema(schema);
    expect(result.type).toBe('string');
  });

  test('converts object schema', () => {
    const schema = z.object({ name: z.string(), age: z.number() });
    const result = zodToJsonSchema(schema);
    expect(result.properties).toBeDefined();
    expect(result.properties.name.type).toBe('string');
    expect(result.properties.age.type).toBe('number');
  });

  test('caches results for same schema', () => {
    const schema = z.string();
    const result1 = zodToJsonSchema(schema);
    const result2 = zodToJsonSchema(schema);
    expect(result1).toBe(result2);
  });
});
