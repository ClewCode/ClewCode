import { describe, expect, test } from 'bun:test';
import { APIError } from '@anthropic-ai/sdk';
import { getAssistantMessageFromError, getProviderRetryAfterMs } from './errors.js';

describe('getAssistantMessageFromError', () => {
  test('formats Gemini Code Assist rate limits without raw JSON', () => {
    const body = JSON.stringify({
      error: {
        code: 429,
        message: 'You have exhausted your capacity on this model. Your quota will reset after 21s.',
        status: 'RESOURCE_EXHAUSTED',
        details: [
          {
            '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
            reason: 'RATE_LIMIT_EXCEEDED',
            domain: 'cloudcode-pa.googleapis.com',
            metadata: {
              uiMessage: 'true',
              model: 'gemini-2.5-flash',
            },
          },
        ],
      },
    });
    const error = new Error(`Code Assist API error (429): ${body}`);
    (error as any).status = 429;
    (error as any).body = body;

    const message = getAssistantMessageFromError(error, 'gemini-2.5-flash');

    expect(message.error).toBe('rate_limit');
    expect(message.message.content).toEqual([
      {
        type: 'text',
        text: 'API Error: Rate limited (429) · You have exhausted your capacity on gemini-2.5-flash. Your quota will reset after 21s.',
      },
    ]);
  });
});

describe('getProviderRetryAfterMs', () => {
  test('extracts retryAfter from _providerError', () => {
    const err = new Error('Rate limited');
    (err as any)._providerError = {
      category: 'rate_limit',
      status: 429,
      retryAfter: 15000,
    };
    expect(getProviderRetryAfterMs(err)).toBe(15000);
  });

  test('extracts retryAfter from standard HTTP headers', () => {
    const headers = new Headers();
    headers.set('retry-after', '15');
    const err = new APIError(429, { error: { message: 'Rate limited' } }, 'Rate limited', headers);
    expect(getProviderRetryAfterMs(err)).toBe(15000);
  });
});
