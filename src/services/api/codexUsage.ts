import { ProviderManager } from '../ai/ProviderManager.js';
import { type CodexWindow, getCodexLimits } from '../codexLimits.js';
import type { RateLimit, Utilization } from './usage.js';

/**
 * Codex (ChatGPT subscription) usage, mapped onto the same `Utilization` shape
 * the Usage panel already renders for Anthropic.
 *
 *   primary window   → five_hour  ("Current session")
 *   secondary window → seven_day  ("Current week")
 *
 * Data comes from the snapshot captured off live `/responses` traffic
 * (`codexLimits.ts`). When no snapshot exists yet (fresh session, no request
 * made), we fire a single best-effort probe request so `/usage` isn't empty on
 * first open. Claude-specific sections (extra_usage, contributing_factors) are
 * simply omitted, so they don't render for Codex.
 */

function toRateLimit(window: CodexWindow | undefined): RateLimit | null {
  if (!window) return null;
  return {
    utilization: window.usedPercent,
    resets_at: window.resetsAt !== undefined ? new Date(window.resetsAt * 1000).toISOString() : null,
  };
}

// Codex reports two windows but their order (primary/secondary) is not a fixed
// short-vs-weekly mapping — classify by window length instead. A window up to
// ~6h is the session window; anything longer is the weekly window.
const SESSION_WINDOW_MAX_MINUTES = 6 * 60;

/**
 * Codex utilization from the passive snapshot only — synchronous, never probes.
 * Returns null when no `/responses` traffic has been seen this session.
 */
export function getCodexUtilization(): Utilization | null {
  const snapshot = getCodexLimits();
  if (!snapshot) return null;

  let session: CodexWindow | undefined;
  let weekly: CodexWindow | undefined;
  for (const window of [snapshot.primary, snapshot.secondary]) {
    if (!window) continue;
    if (window.windowMinutes !== undefined && window.windowMinutes <= SESSION_WINDOW_MAX_MINUTES) {
      session = window;
    } else {
      weekly = window;
    }
  }

  const five_hour = toRateLimit(session);
  const seven_day = toRateLimit(weekly);
  if (!five_hour && !seven_day) return null;
  return {
    ...(five_hour ? { five_hour } : {}),
    ...(seven_day ? { seven_day } : {}),
  };
}

/**
 * Fetch Codex utilization for the Usage panel. Returns the mapped snapshot, or
 * an empty object (→ "only available for subscription plans") when nothing is
 * available. Never throws; probe failures degrade to whatever snapshot exists.
 */
export async function fetchCodexUtilization(): Promise<Utilization | null> {
  // Passive snapshot from normal traffic — use it if present.
  const existing = getCodexUtilization();
  if (existing) return existing;

  // Active fallback: one minimal probe request to populate the snapshot.
  try {
    const manager = ProviderManager.getInstance();
    const provider = manager.getProvider('chatgpt') as unknown as {
      fetchUsageSnapshot?: (opts: { baseUrl?: string; model?: string }) => Promise<unknown>;
    };
    if (typeof provider.fetchUsageSnapshot === 'function') {
      await provider.fetchUsageSnapshot({
        baseUrl: manager.getBaseUrlForProvider('chatgpt'),
        model: manager.getModelForProvider('chatgpt'),
      });
    }
  } catch {
    // Probe is best-effort; fall through to whatever snapshot exists (if any).
  }

  return getCodexUtilization() ?? {};
}
