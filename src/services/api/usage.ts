import { ofetch } from 'ofetch';
import { getOauthConfig } from '../../constants/oauth.js';
import { getClaudeAIOAuthTokens, hasProfileScope, isClaudeAISubscriber } from '../../utils/auth.js';
import { getAuthHeaders } from '../../utils/http.js';
import { getClaudeCodeUserAgent } from '../../utils/userAgent.js';
import { isOAuthTokenExpired } from '../oauth/client.js';

export type RateLimit = {
  utilization: number | null; // a percentage from 0 to 100
  resets_at: string | null; // ISO 8601 timestamp
};

export type ExtraUsage = {
  is_enabled: boolean;
  monthly_limit: number | null;
  used_credits: number | null;
  utilization: number | null;
};

export type Utilization = {
  five_hour?: RateLimit | null;
  seven_day?: RateLimit | null;
  seven_day_oauth_apps?: RateLimit | null;
  seven_day_opus?: RateLimit | null;
  seven_day_sonnet?: RateLimit | null;
  extra_usage?: ExtraUsage | null;
  /** Breakdown of what's contributing to usage limits (upstream API) */
  contributing_factors?: ContributingFactor[] | null;
};

/** A single contributing factor to usage limits */
export type ContributingFactor = {
  reason: string;
  percentage?: number;
  weight?: number;
};

export async function fetchUtilization(): Promise<Utilization | null> {
  if (!isClaudeAISubscriber() || !hasProfileScope()) {
    return {};
  }

  // Refresh OAuth token before fetching usage to avoid "rate limited" errors
  // from a stale token. If the token won't refresh, fall through to the
  // expired-token early-return below.
  const tokens = getClaudeAIOAuthTokens();
  const { refreshOAuthToken } = await import('../oauth/client.js');
  if (tokens?.refreshToken) {
    try {
      await refreshOAuthToken(tokens.refreshToken);
    } catch {
      // Token refresh failed — the current token may still work, so don't
      // abort. The API call below will fail with a proper error if not.
    }
  }

  // Skip API call if OAuth token is expired to avoid 401 errors
  const freshTokens = getClaudeAIOAuthTokens();
  if (freshTokens && isOAuthTokenExpired(freshTokens.expiresAt)) {
    return null;
  }

  const authResult = getAuthHeaders();
  if (authResult.error) {
    throw new Error(`Auth error: ${authResult.error}`);
  }

  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': getClaudeCodeUserAgent(),
    ...authResult.headers,
  };

  const url = `${getOauthConfig().BASE_API_URL}/api/oauth/usage`;

  const response = await ofetch<Utilization>(url, {
    headers,
    timeout: 5000, // 5 second timeout
  });

  return response.data;
}
