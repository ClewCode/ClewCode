import { describe, expect, test } from 'bun:test';
import { AnthropicAdapter, normalizeOpenAIToolInputSchema } from './AnthropicAdapter.js';

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

describe('AnthropicAdapter media fallback', () => {
  test('strips image blocks for DeepSeek text-only models', async () => {
    let capturedParams: any;
    const client = {
      chat: {
        completions: {
          create: async (params: any) => {
            capturedParams = params;
            return {
              id: 'msg-test',
              model: params.model,
              choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
              usage: { prompt_tokens: 1, completion_tokens: 1 },
            };
          },
        },
      },
    };

    const adapter = new AnthropicAdapter(client, 'deepseek');
    await adapter.beta.messages.create({
      model: 'deepseek-v4-pro',
      max_tokens: 16,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'describe this if possible' },
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'abc' } },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } } as any,
          ],
        },
      ],
    } as any);

    expect(capturedParams.messages[0].content).toContain('describe this if possible');
    expect(capturedParams.messages[0].content).toContain('Image not sent');
    expect(JSON.stringify(capturedParams.messages)).not.toContain('image_url');
  });

  test('retries text-only when a gateway rejects images with "not a VLM"', async () => {
    const calls: any[] = [];
    const client = {
      chat: {
        completions: {
          create: async (params: any) => {
            calls.push(params);
            // First attempt (with image) → gateway 400 "not a VLM"
            if (calls.length === 1) {
              const err: any = new Error(
                'The model is not a VLM (Vision Language Model). Please use text-only prompts.',
              );
              err.status = 400;
              throw err;
            }
            return {
              id: 'msg-test',
              model: params.model,
              choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
              usage: { prompt_tokens: 1, completion_tokens: 1 },
            };
          },
        },
      },
    };

    const adapter = new AnthropicAdapter(client, 'opengateway');
    const res = await adapter.beta.messages.create({
      model: 'tencent/hy3',
      max_tokens: 16,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'what is in this image' },
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'abc' } },
          ],
        },
      ],
    } as any);

    // Two attempts: first with image (rejected), retry text-only (succeeds)
    expect(calls).toHaveLength(2);
    expect(JSON.stringify(calls[0].messages)).toContain('image_url');
    expect(JSON.stringify(calls[1].messages)).not.toContain('image_url');
    expect(calls[1].messages[0].content).toContain('Image not sent');
    expect((res as any).content?.[0]?.text ?? '').toBe('ok');
  });
});
