import { describe, expect, test } from 'vitest';
import { CannotRetryError, withRetry } from './withRetry.js';

describe('withRetry', () => {
  test('does not retry adapter-auth provider errors', async () => {
    let attempts = 0;
    const authError = new Error('[OpenAI-Compatible] Authentication failed: No payment method') as Error & {
      _providerError?: { category: 'auth'; status: number };
    };
    authError._providerError = { category: 'auth', status: 401 };

    const generator = withRetry(
      async () => ({}) as never,
      async () => {
        attempts++;
        throw authError;
      },
      {
        maxRetries: 10,
        model: 'deepseek-v4-flash-free',
        thinkingConfig: { type: 'disabled' },
      },
    );

    await expect(generator.next()).rejects.toBeInstanceOf(CannotRetryError);
    expect(attempts).toBe(1);
  });
});
