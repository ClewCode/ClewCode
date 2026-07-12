import { afterEach, describe, expect, test } from 'bun:test';
import { OpenAICompatibleProvider } from './OpenAICompatibleProvider.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('OpenAICompatibleProvider text-only payload fallback', () => {
  test('strips image_url content before sending DeepSeek requests', async () => {
    let requestBody = '';
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      requestBody = String(init?.body ?? '');
      return new Response(
        JSON.stringify({
          id: 'chatcmpl-test',
          model: 'deepseek-v4-pro',
          choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as typeof fetch;

    const provider = new OpenAICompatibleProvider(
      'deepseek' as any,
      'DeepSeek',
      'DEEPSEEK_API_KEY',
      'https://api.deepseek.com/v1',
      false,
      { supportsVision: false },
    );
    const client = await provider.createClient({});

    await client.chat.completions.create({
      model: 'deepseek-v4-pro',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'เอาภาพนี้ไปใส่ README ให้ที' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
          ],
        },
      ],
      stream: false,
    });

    expect(requestBody).toContain('เอาภาพนี้ไปใส่ README ให้ที');
    expect(requestBody).toContain('Image not sent');
    expect(requestBody).not.toContain('image_url');
  });
});
