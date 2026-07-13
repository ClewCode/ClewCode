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

  test('surfaces a retry message for provider (non-APIError) rate-limit errors', async () => {
    const rateError = new Error('[OpenAI-Compatible] Rate limited: 429 FreeUsageLimitError') as Error & {
      _providerError?: { category: 'rate_limit'; status: number };
    };
    rateError._providerError = { category: 'rate_limit', status: 429 };

    const generator = withRetry(
      async () => ({}) as never,
      async () => {
        throw rateError;
      },
      {
        maxRetries: 10,
        model: 'deepseek-v4-flash-free',
        thinkingConfig: { type: 'disabled' },
      },
    );

    // Before this fix the generator swallowed provider errors (yield was gated
    // on `error instanceof APIError`) and the user saw only a silent spinner.
    const first = await generator.next();
    expect(first.done).toBe(false);
    const value = first.value as unknown as { subtype?: string; error?: unknown };
    expect(value?.subtype).toBe('api_error');
    expect(value?.error).toBe(rateError);
  });
});
