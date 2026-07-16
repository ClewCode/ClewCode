import { parseRetryAfter } from '../ai/rateLimits.js';

/**
 * Thrown when a provider reports HTTP 429. `retryAfterMs` carries the
 * provider's `retry-after` hint so the caller can honor it instead of guessing.
 */
export class SearchRateLimitError extends Error {
  readonly provider: string;
  readonly retryAfterMs: number | undefined;

  constructor(provider: string, retryAfterMs?: number) {
    super(`${provider} rate limit exceeded${retryAfterMs === undefined ? '' : ` (retry after ${retryAfterMs}ms)`}`);
    this.name = 'SearchRateLimitError';
    this.provider = provider;
    this.retryAfterMs = retryAfterMs;
  }
}

export class SearchTimeoutError extends Error {
  readonly provider: string;

  constructor(provider: string, timeoutMs: number) {
    super(`${provider} search timed out after ${timeoutMs / 1000}s`);
    this.name = 'SearchTimeoutError';
    this.provider = provider;
  }
}

/** Builds a rate-limit error from a 429 response, honoring `retry-after` when present. */
export function rateLimitErrorFromResponse(provider: string, response: Response): SearchRateLimitError {
  const header = response.headers.get('retry-after');
  return new SearchRateLimitError(provider, header ? parseRetryAfter(header) : undefined);
}
