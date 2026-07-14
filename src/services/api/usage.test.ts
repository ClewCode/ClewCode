import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { getUtilizationFromClaudeHeaderSnapshot, shouldUseClaudeHeaderSnapshotFirst } from './usage.js';

describe('getUtilizationFromClaudeHeaderSnapshot', () => {
  it('maps raw Claude rate-limit header windows to Usage panel utilization bars', () => {
    const utilization = getUtilizationFromClaudeHeaderSnapshot({
      five_hour: { utilization: 0.25, resets_at: 1_784_025_000 },
      seven_day: { utilization: 0.5, resets_at: 1_784_600_000 },
    });

    expect(utilization).toEqual({
      five_hour: { utilization: 25, resets_at: '2026-07-14T10:30:00.000Z' },
      seven_day: { utilization: 50, resets_at: '2026-07-21T02:13:20.000Z' },
    });
  });

  it('returns null when no header snapshot is available', () => {
    expect(getUtilizationFromClaudeHeaderSnapshot({})).toBeNull();
  });
});

describe('shouldUseClaudeHeaderSnapshotFirst', () => {
  it('prefers an available header snapshot before calling the slow usage endpoint', () => {
    expect(shouldUseClaudeHeaderSnapshotFirst({ seven_day: { utilization: 0.1, resets_at: 1_784_600_000 } })).toBe(
      true,
    );
  });

  it('does not prefer headers when no snapshot exists', () => {
    expect(shouldUseClaudeHeaderSnapshotFirst({})).toBe(false);
  });
});

// ─── Web API fallback tests ────────────────────────────────────────────

// Track calls to the mocked ofetch so we can inspect URLs.
const fetchCalls: string[] = [];
const ofetchMock = mock((url: string) => {
  fetchCalls.push(url);

  if (url.includes('/api/organizations') && !url.includes('/usage') && !url.includes('/overage_spend_limit')) {
    return [{ uuid: 'test-org-uuid', name: 'Test Org' }];
  }

  if (url.includes('/overage_spend_limit')) {
    return {
      is_enabled: true,
      monthly_limit: 100_00, // cents
      used_credits: 25_00,
      utilization: 25,
    };
  }

  if (url.includes('/usage')) {
    return {
      five_hour: { utilization: 15, resets_at: '2026-07-14T10:30:00.000Z' },
      seven_day: { utilization: 45, resets_at: '2026-07-21T02:13:20.000Z' },
      seven_day_opus: { utilization: 10, resets_at: '2026-07-21T02:13:20.000Z' },
      seven_day_sonnet: { utilization: 35, resets_at: '2026-07-21T02:13:20.000Z' },
    };
  }

  return {};
});

mock.module('ofetch', () => ({
  ofetch: ofetchMock,
}));

// Mock secure storage so tests don't read the user's real credentials file.
mock.module('../../utils/secureStorage/index.js', () => ({
  getSecureStorage: () => ({
    name: 'mock',
    read: () => ({}),
    readAsync: async () => ({}),
    update: () => ({ success: true }),
    delete: () => true,
  }),
}));

describe('fetchClaudeWebUsage', () => {
  beforeEach(() => {
    // Reset ofetch impl to default and clear call tracking
    ofetchMock.mockImplementation(url => {
      fetchCalls.push(url);
      if (url.includes('/api/organizations') && !url.includes('/usage') && !url.includes('/overage_spend_limit')) {
        return [{ uuid: 'test-org-uuid', name: 'Test Org' }];
      }
      if (url.includes('/overage_spend_limit')) {
        return { is_enabled: true, monthly_limit: 100_00, used_credits: 25_00, utilization: 25 };
      }
      if (url.includes('/usage')) {
        return {
          five_hour: { utilization: 15, resets_at: '2026-07-14T10:30:00.000Z' },
          seven_day: { utilization: 45, resets_at: '2026-07-21T02:13:20.000Z' },
          seven_day_opus: { utilization: 10, resets_at: '2026-07-21T02:13:20.000Z' },
          seven_day_sonnet: { utilization: 35, resets_at: '2026-07-21T02:13:20.000Z' },
        };
      }
      return {};
    });
    ofetchMock.mockClear();
    fetchCalls.length = 0;
  });

  afterEach(() => {
    delete process.env.CLEW_CLAUDE_SESSION_KEY;
    const { __resetClaudeSessionKeyForTests } = require('./usage.js');
    __resetClaudeSessionKeyForTests();
  });

  it('returns null when no session key is available', async () => {
    const { fetchClaudeWebUsage } = await import('./usage.js');
    const result = await fetchClaudeWebUsage();
    expect(result).toBeNull();
    expect(ofetchMock).not.toHaveBeenCalled();
  });

  it('maps successful web API responses to Utilization', async () => {
    process.env.CLEW_CLAUDE_SESSION_KEY = 'test-session-key';
    // Re-import to pick up the env var — the module may already be cached, so
    // we rely on __resetClaudeSessionKeyForTests in afterEach to clear the
    // in-memory cache; the env var is read at first call, not import time.
    const { __resetClaudeSessionKeyForTests, fetchClaudeWebUsage } = await import('./usage.js');
    __resetClaudeSessionKeyForTests();

    const result = await fetchClaudeWebUsage();

    expect(result).not.toBeNull();
    // Web API returns 0-100 already — pass through as-is
    expect(result!.five_hour?.utilization).toBe(15);
    expect(result!.five_hour?.resets_at).toBe('2026-07-14T10:30:00.000Z');
    expect(result!.seven_day?.utilization).toBe(45);
    expect(result!.seven_day?.resets_at).toBe('2026-07-21T02:13:20.000Z');
    expect(result!.seven_day_opus?.utilization).toBe(10);
    expect(result!.seven_day_sonnet?.utilization).toBe(35);
    // extra_usage from overage_spend_limit
    expect(result!.extra_usage?.is_enabled).toBe(true);
    expect(result!.extra_usage?.monthly_limit).toBe(100_00);
    expect(result!.extra_usage?.used_credits).toBe(25_00);

    // Should have made 3 requests: organizations, usage, overage_spend_limit
    expect(fetchCalls.length).toBe(3);
    expect(fetchCalls[0]).toContain('/api/organizations');
    expect(fetchCalls[1]).toContain('/usage');
    expect(fetchCalls[2]).toContain('/overage_spend_limit');
  });

  it('returns null when /api/organizations returns empty', async () => {
    process.env.CLEW_CLAUDE_SESSION_KEY = 'test-session-key';
    // Override the mock just for org list — swap impl for this test
    ofetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/organizations') && !url.includes('/usage') && !url.includes('/overage_spend_limit')) {
        return []; // empty org list
      }
      return {};
    });

    const { __resetClaudeSessionKeyForTests, fetchClaudeWebUsage } = await import('./usage.js');
    __resetClaudeSessionKeyForTests();

    const result = await fetchClaudeWebUsage();
    expect(result).toBeNull();
  });

  it('returns null when /api/organizations/{id}/usage fails (401/403)', async () => {
    process.env.CLEW_CLAUDE_SESSION_KEY = 'test-session-key';
    ofetchMock.mockImplementation((url: string) => {
      if (url.includes('/usage')) throw Object.assign(new Error('Unauthorized'), { status: 401 });
      return [{ uuid: 'test-org-uuid', name: 'Test Org' }];
    });

    const { __resetClaudeSessionKeyForTests, fetchClaudeWebUsage } = await import('./usage.js');
    __resetClaudeSessionKeyForTests();

    const result = await fetchClaudeWebUsage();
    expect(result).toBeNull();
  });
});
