import { ofetch } from 'ofetch';
import { getOauthConfig, OAUTH_BETA_HEADER } from '../../constants/oauth.js';
import { getClaudeAIOAuthTokens } from '../../utils/auth.js';
import { getClaudeCodeUserAgent } from '../../utils/userAgent.js';
import { getSecureStorage } from '../../utils/secureStorage/index.js';
import { getRawUtilization } from '../claudeAiLimits.js';
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

/** Thrown when the usage endpoint returns 429 and no cached data is available. */
export class UsageRateLimitedError extends Error {
  readonly status = 429;
  constructor(readonly retryAfterSeconds: number | null) {
    super('Usage data is rate-limited');
    this.name = 'UsageRateLimitedError';
  }
}

// The `/api/oauth/usage` endpoint is strictly rate-limited per account, so we
// (1) serve a short-lived cache to collapse rapid re-opens, and (2) honor the
// server's retry-after so clew never hammers the endpoint into a self-inflicted
// 429. Serving slightly stale usage bars beats erroring.
type UsageCache = { data: Utilization | null; fetchedAt: number };
let usageCache: UsageCache | null = null;
let rateLimitedUntilMs = 0;
const USAGE_CACHE_TTL_MS = 60_000;

export function __resetUsageCacheForTests(): void {
  usageCache = null;
  rateLimitedUntilMs = 0;
}

/** @private Reset session key cache between tests. */
export function __resetClaudeSessionKeyForTests(): void {
  _sessionKeyCache = undefined;
}

// ─── Web API session key ────────────────────────────────────────────────

const SESSION_KEY_STORAGE_KEY = 'claudeSessionKey';
let _sessionKeyCache: string | undefined;

/**
 * Read the Claude.ai session key (sessionKey cookie value).
 *
 * Priority:
 * 1. `CLEW_CLAUDE_SESSION_KEY` env var (for CI / power users)
 * 2. Secure storage (persisted by `/usage-cookie` or equivalent command)
 *
 * Never logged or printed.
 */
export function getClaudeSessionKey(): string | undefined {
  if (_sessionKeyCache !== undefined) return _sessionKeyCache;

  const envKey = process.env.CLEW_CLAUDE_SESSION_KEY;
  if (envKey) {
    _sessionKeyCache = envKey;
    return envKey;
  }

  try {
    const storage = getSecureStorage();
    const data = storage.read();
    const stored = data?.[SESSION_KEY_STORAGE_KEY];
    if (typeof stored === 'string' && stored.length > 0) {
      _sessionKeyCache = stored;
      return stored;
    }
  } catch {
    // Secure storage unavailable — fall through
  }

  _sessionKeyCache = undefined;
  return undefined;
}

/**
 * Persist a Claude.ai session key to secure storage.
 * The key is never logged or printed.
 */
export function setClaudeSessionKey(key: string): void {
  _sessionKeyCache = key;
  try {
    const storage = getSecureStorage();
    const data = storage.read() || {};
    data[SESSION_KEY_STORAGE_KEY] = key;
    storage.update(data);
  } catch {
    // Best-effort; env-var path works without storage.
  }
}

// ─── Web API fallback types & fetch ─────────────────────────────────────

/** Raw shape returned by `GET /api/organizations/{orgId}/usage`. */
type ClaudeWebUsageResponse = Record<string, unknown>;

/** Shape of a single usage-rate window in the web API response. */
type ClaudeWebRateWindow = {
  utilization?: unknown;
  resets_at?: unknown;
};

/**
 * Fetch usage data from the Claude.ai Web API using a sessionKey cookie.
 *
 * Falls back to this when the OAuth `/api/oauth/usage` endpoint returns
 * empty or errors with 401. Returns `null` when the session key is missing,
 * the API is unreachable, or the response cannot be mapped.
 *
 * Endpoints called:
 *   GET https://claude.ai/api/organizations          → pick first org UUID
 *   GET https://claude.ai/api/organizations/{id}/usage → usage windows
 *   GET https://claude.ai/api/organizations/{id}/overage_spend_limit → extra credits
 *
 * All requests carry `Cookie: sessionKey=<key>` to authenticate.
 */
export async function fetchClaudeWebUsage(): Promise<Utilization | null> {
  const sessionKey = getClaudeSessionKey();
  if (!sessionKey) return null;

  const baseUrl = 'https://claude.ai';
  const cookie = `sessionKey=${sessionKey}`;
  const userAgent = getClaudeCodeUserAgent();
  const commonHeaders = {
    'User-Agent': userAgent,
    Cookie: cookie,
    'Content-Type': 'application/json',
  };

  // 1. Fetch organizations to get the active org UUID.
  let orgUuid: string;
  try {
    const orgs = await ofetch<Array<Record<string, unknown>>>(`${baseUrl}/api/organizations`, {
      headers: commonHeaders,
      timeout: 5000,
    });
    const org = orgs?.[0];
    if (!org || typeof org.uuid !== 'string') return null;
    orgUuid = org.uuid;
  } catch {
    return null;
  }

  // 2. Fetch usage data for the selected org.
  let usageBody: ClaudeWebUsageResponse;
  try {
    usageBody = await ofetch<ClaudeWebUsageResponse>(`${baseUrl}/api/organizations/${orgUuid}/usage`, {
      headers: commonHeaders,
      timeout: 5000,
    });
  } catch {
    return null;
  }

  // 3. Map web API response to our Utilization type.
  const tryMapWindow = (key: string): RateLimit | null => {
    const raw = usageBody[key];
    if (!raw || typeof raw !== 'object') return null;
    const w = raw as ClaudeWebRateWindow;
    const utilization = typeof w.utilization === 'number' ? w.utilization : null;
    const resets_at = typeof w.resets_at === 'string' ? w.resets_at : null;
    if (utilization === null && resets_at === null) return null;
    return {
      // Web API returns 0-100 (already percentage), same as our type expects.
      utilization: utilization !== null ? Math.round(utilization) : null,
      resets_at,
    };
  };

  const five_hour = tryMapWindow('five_hour');
  const seven_day = tryMapWindow('seven_day');
  const seven_day_opus = tryMapWindow('seven_day_opus');
  const seven_day_sonnet = tryMapWindow('seven_day_sonnet');
  const seven_day_oauth_apps = tryMapWindow('seven_day_oauth_apps');

  // Also pick up any unknown seven_day_* keys from the response.
  const extraWindows: Record<string, RateLimit> = {};
  for (const key of Object.keys(usageBody)) {
    if (key.startsWith('seven_day_') && !extraWindows[key]) {
      const known = ['seven_day', 'seven_day_opus', 'seven_day_sonnet', 'seven_day_oauth_apps'];
      if (!known.includes(key)) {
        const mapped = tryMapWindow(key);
        if (mapped) extraWindows[key] = mapped;
      }
    }
  }

  if (!five_hour && !seven_day && !seven_day_opus && !seven_day_sonnet && Object.keys(extraWindows).length === 0) {
    return null;
  }

  const result: Utilization = {};
  if (five_hour) result.five_hour = five_hour;
  if (seven_day) result.seven_day = seven_day;
  if (seven_day_opus) result.seven_day_opus = seven_day_opus;
  if (seven_day_sonnet) result.seven_day_sonnet = seven_day_sonnet;
  if (seven_day_oauth_apps) result.seven_day_oauth_apps = seven_day_oauth_apps;
  for (const [key, val] of Object.entries(extraWindows)) {
    (result as Record<string, unknown>)[key] = val;
  }

  // 4. (optional) Fetch overage spend limit.
  try {
    const overage = await ofetch<Record<string, unknown>>(
      `${baseUrl}/api/organizations/${orgUuid}/overage_spend_limit`,
      { headers: commonHeaders, timeout: 5000 },
    );
    const isEnabled = typeof overage.is_enabled === 'boolean' ? overage.is_enabled : false;
    const monthlyLimit = typeof overage.monthly_limit === 'number' ? overage.monthly_limit : null;
    const usedCredits = typeof overage.used_credits === 'number' ? overage.used_credits : null;
    const utilization = typeof overage.utilization === 'number' ? overage.utilization : null;
    if (isEnabled || monthlyLimit !== null || usedCredits !== null) {
      result.extra_usage = {
        is_enabled: isEnabled,
        monthly_limit: monthlyLimit,
        used_credits: usedCredits,
        utilization,
      };
    }
  } catch {
    // Overage endpoint is optional — don't fail the whole fallback.
  }

  return result;
}

export function shouldUseClaudeHeaderSnapshotFirst(raw = getRawUtilization()): boolean {
  return Boolean(raw.five_hour || raw.seven_day);
}

export function getUtilizationFromClaudeHeaderSnapshot(raw = getRawUtilization()): Utilization | null {
  const toRateLimit = (window: { utilization: number; resets_at: number } | undefined): RateLimit | null => {
    if (!window) return null;
    return {
      utilization: window.utilization * 100,
      resets_at: new Date(window.resets_at * 1000).toISOString(),
    };
  };

  const five_hour = toRateLimit(raw.five_hour);
  const seven_day = toRateLimit(raw.seven_day);
  if (!five_hour && !seven_day) return null;
  return {
    ...(five_hour ? { five_hour } : {}),
    ...(seven_day ? { seven_day } : {}),
  };
}

export async function fetchUtilization(): Promise<Utilization | null> {
  const oauthTokens = getClaudeAIOAuthTokens();
  if (!oauthTokens?.scopes?.includes('user:inference')) {
    return {};
  }

  const now = Date.now();
  // Header snapshots come from normal Claude traffic and render immediately.
  // Prefer them before the `/api/oauth/usage` endpoint so the Usage tab doesn't
  // sit on "Loading usage data…" behind a 5s timeout or a strict 429 window.
  const headerSnapshot = getUtilizationFromClaudeHeaderSnapshot();
  if (headerSnapshot && shouldUseClaudeHeaderSnapshotFirst()) {
    return headerSnapshot;
  }
  // Fresh cache — skip the network entirely.
  if (usageCache && now - usageCache.fetchedAt < USAGE_CACHE_TTL_MS) {
    return usageCache.data;
  }
  // Inside the server's retry-after window — don't call, serve stale if we have
  // it, otherwise report the rate limit with time remaining.
  if (now < rateLimitedUntilMs) {
    if (usageCache) return usageCache.data;
    const headerSnapshot = getUtilizationFromClaudeHeaderSnapshot();
    if (headerSnapshot) return headerSnapshot;
    throw new UsageRateLimitedError(Math.ceil((rateLimitedUntilMs - now) / 1000));
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

  if (!oauthTokens.accessToken) {
    return {};
  }

  // Use the most recent token (may have been refreshed above)
  const accessToken = freshTokens?.accessToken ?? oauthTokens.accessToken;

  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': getClaudeCodeUserAgent(),
    Authorization: `Bearer ${accessToken}`,
    'anthropic-beta': OAUTH_BETA_HEADER,
  };

  const url = `${getOauthConfig().BASE_API_URL}/api/oauth/usage`;

  try {
    const response = await ofetch<Utilization>(url, {
      headers,
      timeout: 5000, // 5 second timeout
    });
    usageCache = { data: response, fetchedAt: Date.now() };
    return response;
  } catch (err) {
    const e = err as {
      status?: number;
      statusCode?: number;
      response?: { status?: number; headers?: { get?: (name: string) => string | null } };
    };
    const status = e.status ?? e.statusCode ?? e.response?.status;
    if (status === 429) {
      const raw = Number(e.response?.headers?.get?.('retry-after'));
      const retryAfter = Number.isFinite(raw) && raw > 0 ? raw : null;
      // Back off for the advertised window (default 5 min if not provided).
      rateLimitedUntilMs = Date.now() + (retryAfter ?? 300) * 1000;
      if (usageCache) return usageCache.data; // serve stale rather than error
      const headerSnapshot = getUtilizationFromClaudeHeaderSnapshot();
      if (headerSnapshot) return headerSnapshot;
      throw new UsageRateLimitedError(retryAfter);
    }
    throw err;
  }
}
