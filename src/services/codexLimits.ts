import { logError } from '../utils/log.js';

/**
 * Codex (ChatGPT subscription) usage limits.
 *
 * Unlike Anthropic, the Codex OAuth backend exposes no dedicated usage
 * endpoint, so we capture rate-limit information off live `/responses` traffic
 * (mirroring how `claudeAiLimits.ts` reads Anthropic rate-limit headers).
 *
 * Codex reports two rolling windows:
 *   - primary   ≈ 5-hour session window
 *   - secondary ≈ weekly window
 *
 * The exact field names (`x-codex-*` headers vs. a `rate_limits` field on the
 * `response.completed` SSE event) are undocumented and have drifted between
 * backend versions, so every parser here is deliberately defensive: it probes
 * several candidate shapes and degrades to `null` rather than throwing.
 */

/** A single Codex rate-limit window, normalized. */
export type CodexWindow = {
  /** Percent of the window consumed, 0–100. */
  usedPercent: number;
  /** Unix epoch seconds when the window resets, if known. */
  resetsAt?: number;
  /** Nominal window length in minutes, if reported. */
  windowMinutes?: number;
};

export type CodexLimitsSnapshot = {
  primary?: CodexWindow;
  secondary?: CodexWindow;
  /** Unix epoch seconds when this snapshot was captured. */
  capturedAt: number;
};

let currentSnapshot: CodexLimitsSnapshot | null = null;

/** Last captured Codex usage snapshot, or null if none seen this session. */
export function getCodexLimits(): CodexLimitsSnapshot | null {
  return currentSnapshot;
}

/** Testing/reset hook. */
export function resetCodexLimits(): void {
  currentSnapshot = null;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** Coerce an unknown into a finite number, or undefined. */
function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/** Read the first header present from a list of candidate names. */
function readHeader(headers: Headers, names: string[]): string | null {
  for (const name of names) {
    const v = headers.get(name);
    if (v !== null) return v;
  }
  return null;
}

/**
 * A reset value may arrive as an absolute epoch timestamp or as a relative
 * "seconds from now" duration. Small values are treated as relative.
 */
function resolveResetsAt(raw: number | undefined): number | undefined {
  if (raw === undefined) return undefined;
  // Anything below ~Jan 2001 in epoch seconds is really a duration.
  const RELATIVE_THRESHOLD = 1_000_000_000;
  return raw < RELATIVE_THRESHOLD ? nowSeconds() + raw : raw;
}

function windowFromHeaders(headers: Headers, prefix: 'primary' | 'secondary'): CodexWindow | undefined {
  const used = toNumber(
    readHeader(headers, [
      `x-codex-${prefix}-used-percent`,
      `x-codex-${prefix}-used_percent`,
      `x-codex-ratelimit-${prefix}-used-percent`,
    ]),
  );
  if (used === undefined) return undefined;

  const resetRaw = toNumber(
    readHeader(headers, [
      `x-codex-${prefix}-resets-in-seconds`,
      `x-codex-${prefix}-reset-after-seconds`,
      `x-codex-${prefix}-reset`,
    ]),
  );
  const windowMinutes = toNumber(readHeader(headers, [`x-codex-${prefix}-window-minutes`, `x-codex-${prefix}-window`]));
  // A window reported with length 0 is inactive/not-provisioned (Codex sends
  // an all-zero secondary window on plans that only have one active window).
  if (windowMinutes === 0) return undefined;

  return {
    usedPercent: used,
    ...(resolveResetsAt(resetRaw) !== undefined ? { resetsAt: resolveResetsAt(resetRaw) } : {}),
    ...(windowMinutes !== undefined ? { windowMinutes } : {}),
  };
}

function windowFromObject(value: unknown): CodexWindow | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const obj = value as Record<string, unknown>;
  const used = toNumber(obj.used_percent ?? obj.usedPercent ?? obj.utilization ?? obj.percent);
  if (used === undefined) return undefined;

  const resetRaw = toNumber(
    obj.resets_in_seconds ?? obj.resetsInSeconds ?? obj.reset_after_seconds ?? obj.resets_at ?? obj.resetsAt,
  );
  const windowMinutes = toNumber(obj.window_minutes ?? obj.windowMinutes);
  if (windowMinutes === 0) return undefined;

  return {
    usedPercent: used,
    ...(resolveResetsAt(resetRaw) !== undefined ? { resetsAt: resolveResetsAt(resetRaw) } : {}),
    ...(windowMinutes !== undefined ? { windowMinutes } : {}),
  };
}

/**
 * Parse a `rate_limits`-shaped object (from a `response.completed` SSE event or
 * response body) into a snapshot. Tolerates missing/renamed windows.
 */
export function parseCodexRateLimits(rateLimits: unknown): CodexLimitsSnapshot | null {
  if (!rateLimits || typeof rateLimits !== 'object') return null;
  const obj = rateLimits as Record<string, unknown>;
  const primary = windowFromObject(obj.primary);
  const secondary = windowFromObject(obj.secondary);
  if (!primary && !secondary) return null;
  return {
    ...(primary ? { primary } : {}),
    ...(secondary ? { secondary } : {}),
    capturedAt: nowSeconds(),
  };
}

/**
 * Extract a Codex usage snapshot from a response's headers and/or an optional
 * `rate_limits` object, store it as the current snapshot, and return it.
 *
 * Never throws — a parsing failure logs and returns null so it can be called
 * inline on the request hot path without risking a real completion.
 */
export function extractCodexLimitsFromResponse(
  headers?: Headers | null,
  rateLimits?: unknown,
): CodexLimitsSnapshot | null {
  try {
    let snapshot: CodexLimitsSnapshot | null = null;

    if (headers) {
      const primary = windowFromHeaders(headers, 'primary');
      const secondary = windowFromHeaders(headers, 'secondary');
      if (primary || secondary) {
        snapshot = {
          ...(primary ? { primary } : {}),
          ...(secondary ? { secondary } : {}),
          capturedAt: nowSeconds(),
        };
      }
    }

    // Fall back to (or merge in) an SSE/body rate_limits object.
    if (!snapshot && rateLimits !== undefined) {
      snapshot = parseCodexRateLimits(rateLimits);
    }

    if (snapshot) {
      currentSnapshot = snapshot;
    }
    return snapshot;
  } catch (error) {
    logError(error as Error);
    return null;
  }
}
