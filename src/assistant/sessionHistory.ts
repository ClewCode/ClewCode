import { ofetch } from 'ofetch';
import { getOauthConfig } from '../constants/oauth.js';
import type { SDKMessage } from '../entrypoints/agentSdkTypes.js';
import { logForDebugging } from '../utils/debug.js';
import { getOAuthHeaders, prepareApiRequest } from '../utils/teleport/api.js';

export const HISTORY_PAGE_SIZE = 100;

export type HistoryPage = {
  /** Chronological order within the page. */
  events: SDKMessage[];
  /** Oldest event ID in this page → before_id cursor for next-older page. */
  firstId: string | null;
  /** true = older events exist. */
  hasMore: boolean;
};

type SessionEventsResponse = {
  data: SDKMessage[];
  has_more: boolean;
  first_id: string | null;
  last_id: string | null;
};

export type HistoryAuthCtx = {
  baseUrl: string;
  headers: Record<string, string>;
};

/** Prepare auth + headers + base URL once, reuse across pages. */
export async function createHistoryAuthCtx(sessionId: string): Promise<HistoryAuthCtx> {
  const { accessToken, orgUUID } = await prepareApiRequest();
  return {
    baseUrl: `${getOauthConfig().BASE_API_URL}/v1/sessions/${sessionId}/events`,
    headers: {
      ...getOAuthHeaders(accessToken),
      'anthropic-beta': 'ccr-byoc-2025-07-29',
      'x-organization-uuid': orgUUID,
    },
  };
}

async function fetchPage(
  ctx: HistoryAuthCtx,
  params: Record<string, string | number | boolean>,
  label: string,
): Promise<HistoryPage | null> {
  const resp = (await ofetch
    .raw(ctx.baseUrl, {
      headers: ctx.headers,
      params,
      timeout: 15000,
      ignoreResponseError: true,
    })
    .catch(err => {
      logForDebugging(`[${label}] ofetch error: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    })) as { status: number; _data: SessionEventsResponse } | null;
  if (resp?.status !== 200) {
    logForDebugging(`[${label}] HTTP ${resp?.status ?? 'error'}`);
    return null;
  }
  return {
    events: Array.isArray(resp._data.data) ? resp._data.data : [],
    firstId: resp._data.first_id,
    hasMore: resp._data.has_more,
  };
}

/**
 * Newest page: last `limit` events, chronological, via anchor_to_latest.
 * has_more=true means older events exist.
 */
export async function fetchLatestEvents(ctx: HistoryAuthCtx, limit = HISTORY_PAGE_SIZE): Promise<HistoryPage | null> {
  return fetchPage(ctx, { limit, anchor_to_latest: true }, 'fetchLatestEvents');
}

/** Older page: events immediately before `beforeId` cursor. */
export async function fetchOlderEvents(
  ctx: HistoryAuthCtx,
  beforeId: string,
  limit = HISTORY_PAGE_SIZE,
): Promise<HistoryPage | null> {
  return fetchPage(ctx, { limit, before_id: beforeId }, 'fetchOlderEvents');
}
