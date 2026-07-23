import { describe, expect, test } from 'bun:test';
import { parseResetTimeMs, toCodeAssistMessages, toolCallsFromParts } from './CodeAssistProvider.js';

describe('parseResetTimeMs', () => {
  test('parses seconds, minutes, hours', () => {
    expect(parseResetTimeMs('reset after 5s')).toBe(5000);
    expect(parseResetTimeMs('reset after 2m')).toBe(120_000);
    expect(parseResetTimeMs('reset after 1h')).toBe(3_600_000);
  });

  test('parses milliseconds as milliseconds, not minutes', () => {
    expect(parseResetTimeMs('reset after 500ms')).toBe(500);
  });
});

describe('toolCallsFromParts', () => {
  test('assigns unique ids when the same function is called twice', () => {
    const parts = [
      { functionCall: { name: 'Read', args: { path: 'a.ts' } } },
      { functionCall: { name: 'Read', args: { path: 'b.ts' } } },
    ];
    const calls = toolCallsFromParts(parts);
    expect(calls).toHaveLength(2);
    expect(calls[0].id).not.toBe(calls[1].id);
    expect(calls[0].function.name).toBe('Read');
    expect(calls[1].function.name).toBe('Read');
  });
});

describe('toCodeAssistMessages', () => {
  test('recovers the function name from a suffixed tool_call_id', () => {
    const parts = [{ functionCall: { name: 'Read', args: {} } }];
    const [call] = toolCallsFromParts(parts);

    const { contents } = toCodeAssistMessages([{ role: 'tool', tool_call_id: call.id, content: '{"ok":true}' }]);

    expect(contents).toHaveLength(1);
    const part = contents[0].parts[0] as { functionResponse: { name: string } };
    expect(part.functionResponse.name).toBe('Read');
  });

  test('inserts a notice when image content is dropped from a user message', () => {
    const { contents } = toCodeAssistMessages([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'what is in this image?' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } } as any,
        ],
      },
    ]);

    const text = (contents[0].parts[0] as { text: string }).text;
    expect(text).toContain('what is in this image?');
    expect(text).toContain('Image not sent');
  });
});

describe('hasAntigravityOAuthCreds', () => {
  test('returns a boolean value without throwing', () => {
    const { hasAntigravityOAuthCreds } = require('./CodeAssistProvider.js');
    expect(typeof hasAntigravityOAuthCreds()).toBe('boolean');
  });
});

describe('ANTIGRAVITY_OAUTH_CLIENT', () => {
  test('returns client ID from fallback when environment is empty', () => {
    const { ANTIGRAVITY_OAUTH_CLIENT } = require('./CodeAssistProvider.js');
    expect(ANTIGRAVITY_OAUTH_CLIENT.clientId).toContain('apps.googleusercontent.com');
  });

  test('redirect URI uses official antigravity.google redirect URI', () => {
    const { ANTIGRAVITY_REDIRECT_URI } = require('./CodeAssistProvider.js');
    const uri = new URL(ANTIGRAVITY_REDIRECT_URI);
    expect(uri.hostname).toBe('antigravity.google');
    expect(uri.pathname).toBe('/oauth-callback');
  });
});

describe('handleSSEStream', () => {
  test('parses thinking parts and text parts into reasoning_content and content', async () => {
    const { handleSSEStream } = require('./CodeAssistProvider.js');
    const payload = JSON.stringify({
      response: {
        candidates: [
          {
            content: {
              parts: [{ text: 'Let me think...', thought: true }, { text: 'Here is the answer.' }],
            },
            finishReason: 'STOP',
          },
        ],
      },
    });

    const bodyText = `data: ${payload}\n\n`;
    const response = new Response(bodyText);
    const chunks: any[] = [];
    for await (const chunk of handleSSEStream(response)) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBe(1);
    expect(chunks[0].choices[0].delta.reasoning_content).toBe('Let me think...');
    expect(chunks[0].choices[0].delta.content).toBe('Here is the answer.');
  });

  test('flushes remaining buffer text when stream finishes', async () => {
    const { handleSSEStream } = require('./CodeAssistProvider.js');
    const payload = JSON.stringify({
      response: {
        candidates: [{ content: { parts: [{ text: 'Final text without newline' }] } }],
      },
    });

    // Stream ends without trailing newline
    const bodyText = `data: ${payload}`;
    const response = new Response(bodyText);
    const chunks: any[] = [];
    for await (const chunk of handleSSEStream(response)) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBe(1);
    expect(chunks[0].choices[0].delta.content).toBe('Final text without newline');
  });
});
