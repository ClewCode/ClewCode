export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetSeconds: number;
}

export interface RateLimits {
  requests?: RateLimitInfo;
  tokens?: RateLimitInfo;
}

/**
 * Extract rate limit information from OpenAI response headers.
 * OpenAI returns headers like:
 * - x-ratelimit-limit-requests: "10000"
 * - x-ratelimit-remaining-requests: "9999"
 * - x-ratelimit-reset-requests: "60s"
 */
export function extractRateLimitsFromHeaders(headers: Headers): RateLimits {
  const result: RateLimits = {};

  const requestLimit = headers.get('x-ratelimit-limit-requests');
  const requestRemaining = headers.get('x-ratelimit-remaining-requests');
  const requestReset = headers.get('x-ratelimit-reset-requests');

  if (requestLimit && requestRemaining && requestReset) {
    result.requests = {
      limit: Number(requestLimit),
      remaining: Number(requestRemaining),
      resetSeconds: parseResetTime(requestReset),
    };
  }

  const tokenLimit = headers.get('x-ratelimit-limit-tokens');
  const tokenRemaining = headers.get('x-ratelimit-remaining-tokens');
  const tokenReset = headers.get('x-ratelimit-reset-tokens');

  if (tokenLimit && tokenRemaining && tokenReset) {
    result.tokens = {
      limit: Number(tokenLimit),
      remaining: Number(tokenRemaining),
      resetSeconds: parseResetTime(tokenReset),
    };
  }

  return result;
}

/**
 * Parse OpenAI reset time format (e.g. "60s" → 60)
 */
function parseResetTime(value: string): number {
  const match = value.match(/^(\d+)([smh]?)$/);
  if (!match) return 60; // default

  const num = Number(match[1]);
  const unit = match[2] || 's';
  if (unit === 'm') return num * 60;
  if (unit === 'h') return num * 3600;
  return num;
}

/**
 * Parse Retry-After header value (seconds or HTTP-date format).
 * Returns milliseconds, clamped to at least 1000ms.
 *
 * Examples:
 * - "60" → 60000 ms
 * - "Wed, 21 Oct 2025 07:28:00 GMT" → milliseconds until that time
 */
export function parseRetryAfter(value: string): number {
  // Try parsing as seconds (numeric)
  const seconds = Number(value);
  if (!Number.isNaN(seconds) && isFinite(seconds)) {
    return Math.max(1000, seconds * 1000);
  }

  // Try parsing as HTTP-date
  try {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      const msUntilReset = date.getTime() - Date.now();
      return Math.max(1000, msUntilReset);
    }
  } catch {
    // Fall through
  }

  // Default to 1 second if unparseable
  return 1000;
}
