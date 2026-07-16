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
    const client: any = await provider.createClient({});

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

  test('preserves non-text, non-image content parts when stripping images', async () => {
    let requestBody = '';
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      requestBody = String(init?.body ?? '');
      return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }], usage: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    const provider = new OpenAICompatibleProvider(
      'deepseek' as any,
      'DeepSeek',
      'DEEPSEEK_API_KEY',
      'https://api.deepseek.com/v1',
      false,
      { supportsVision: false },
    );
    const client: any = await provider.createClient({});

    await client.chat.completions.create({
      model: 'deepseek-v4-pro',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'here is the file' },
            { type: 'input_file', file_id: 'file-abc123' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
          ],
        },
      ],
      stream: false,
    });

    expect(requestBody).toContain('here is the file');
    expect(requestBody).toContain('file-abc123');
    expect(requestBody).not.toContain('image_url');
  });
});

describe('OpenAICompatibleProvider retry behavior', () => {
  test('does not retry when a 200 response has an unparseable body', async () => {
    let fetchCalls = 0;
    globalThis.fetch = (async (_url: string | URL | Request) => {
      fetchCalls++;
      return new Response('not json at all', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    const provider = new OpenAICompatibleProvider(
      'deepseek' as any,
      'DeepSeek',
      'DEEPSEEK_API_KEY',
      'https://api.deepseek.com/v1',
      false,
    );
    const client: any = await provider.createClient({});

    await expect(client.chat.completions.create({ model: 'm', messages: [], stream: false })).rejects.toThrow();
    expect(fetchCalls).toBe(1);
  });
});

describe('OpenAICompatibleProvider base URL env override', () => {
  test('maps hyphenated provider ids to underscore env var names', async () => {
    let requestedUrl = '';
    globalThis.fetch = (async (url: string | URL | Request) => {
      requestedUrl = String(url);
      return new Response(JSON.stringify({ choices: [], usage: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    process.env.KILO_CODE_BASE_URL = 'https://custom.example.com/v1';
    try {
      const provider = new OpenAICompatibleProvider(
        'kilo-code' as any,
        'Kilo Code',
        'KILO_CODE_API_KEY',
        'https://default.example.com/v1',
        false,
      );
      const client: any = await provider.createClient({});
      await client.chat.completions.create({ model: 'm', messages: [], stream: false });

      expect(requestedUrl).toBe('https://custom.example.com/v1/chat/completions');
    } finally {
      delete process.env.KILO_CODE_BASE_URL;
    }
  });
});

describe('OpenAICompatibleProvider retry-after handling', () => {
  test('respects Retry-After header on 429 response', async () => {
    let fetchCalls = 0;
    const delays: number[] = [];
    const startTime = Date.now();

    globalThis.fetch = (async () => {
      fetchCalls++;
      if (fetchCalls <= 2) {
        return new Response('Rate limited', {
          status: 429,
          headers: { 'Retry-After': '1', 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ choices: [], usage: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    const provider = new OpenAICompatibleProvider('test' as any, 'Test', 'TEST_KEY', 'http://localhost', false);
    const client: any = await provider.createClient({});

    await client.chat.completions.create({ model: 'm', messages: [], stream: false });

    expect(fetchCalls).toBe(3);
    const elapsed = Date.now() - startTime;
    // Should have delayed at least 1 second per retry (Retry-After: 1)
    expect(elapsed).toBeGreaterThanOrEqual(1500); // allow some margin
  });
});

describe('OpenAICompatibleProvider streaming chunk validation', () => {
  test('logs invalid JSON chunks instead of silently skipping', async () => {
    const warnings: { chunk: string; error: string }[] = [];

    globalThis.fetch = (async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"ok"}}]}\n'));
          controller.enqueue(new TextEncoder().encode('data: invalid json here\n'));
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n'));
          controller.close();
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    }) as typeof fetch;

    const provider = new OpenAICompatibleProvider('test' as any, 'Test', 'TEST_KEY', 'http://localhost', false, {
      onStreamingWarning: (chunk, error) => {
        warnings.push({ chunk, error: String(error) });
      },
    });

    const client: any = await provider.createClient({});
    const chunks: any[] = [];
    for await (const chunk of await client.chat.completions.create({ model: 'm', messages: [], stream: true })) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBe(1); // only the valid chunk
    expect(warnings.length).toBe(1); // one invalid chunk logged
    expect(warnings[0].chunk).toBe('invalid json here');
  });
});
