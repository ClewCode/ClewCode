import { homedir } from 'os';
import { logForDebugging } from './debug.js';

/**
 * Sentry Error Reporting utility for Clew Code.
 *
 * This module is strictly NO-OP by default. Sentry will only activate when the
 * `SENTRY_DSN` environment variable is set. This means zero external network calls,
 * zero telemetry, and zero performance cost unless explicitly opted-in.
 *
 * Privacy First:
 * - No prompts, model responses, file contents, or command outputs ever leave this machine.
 * - All authorization headers, API keys, tokens, and cookies are scrubbed from events.
 * - Home directory paths are anonymized to "[HOME]" to prevent user identity leakage.
 * - Only error names, stack traces (without local variable values), and runtime info are sent.
 */

// Lazy Sentry client reference — null means not initialized or disabled
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sentryClient: any = null;
let sentryInitialized = false;

/** Returns true if Sentry is currently active and initialized. */
export function isSentryEnabled(): boolean {
  return sentryInitialized && sentryClient !== null;
}

/** Returns the masked DSN (e.g. "https://abc...xyz@o123.ingest.sentry.io/456") for diagnostics. */
export function getMaskedSentryDsn(): string {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return '';
  // Show only the first 8 and last 4 chars of the key, rest as asterisks
  try {
    const url = new URL(dsn);
    const key = url.username;
    if (key.length > 12) {
      url.username = `${key.slice(0, 8)}...${key.slice(-4)}`;
    }
    return url.toString();
  } catch {
    return '[invalid DSN]';
  }
}

/**
 * Patterns that indicate sensitive PII/credentials that must never leave this machine.
 */
const SCRUB_PATTERNS: Array<[RegExp, string]> = [
  // API Keys and Tokens
  [/sk-[A-Za-z0-9_-]{20,}/g, '[API_KEY]'],
  [/Bearer\s+[A-Za-z0-9._-]{16,}/gi, 'Bearer [TOKEN]'],
  [/Authorization:\s*[^\s,}]+/gi, 'Authorization: [REDACTED]'],
  [/x-api-key:\s*[^\s,}]+/gi, 'x-api-key: [REDACTED]'],
  [/api[_-]?key["\s:=]+[A-Za-z0-9._-]{8,}/gi, 'api-key=[REDACTED]'],
  // Cookie headers
  [/Cookie:\s*[^\n]+/gi, 'Cookie: [REDACTED]'],
  [/Set-Cookie:\s*[^\n]+/gi, 'Set-Cookie: [REDACTED]'],
  // OAuth Tokens
  [/access[_-]token[":\s]+[A-Za-z0-9._-]{16,}/gi, 'access-token=[REDACTED]'],
  [/refresh[_-]token[":\s]+[A-Za-z0-9._-]{16,}/gi, 'refresh-token=[REDACTED]'],
  // Home directory paths (Windows and Unix)
  [
    new RegExp(
      homedir()
        .replace(/[\\/]/g, '[/\\\\]')
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      'g',
    ),
    '[HOME]',
  ],
];

/**
 * Scrub a string to remove sensitive information.
 */
function scrubString(value: string): string {
  let result = value;
  for (const [pattern, replacement] of SCRUB_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Recursively scrub an object/array/string of sensitive information.
 * Limits depth and string length to prevent performance issues.
 */
function scrubValue(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[max depth]';
  if (typeof value === 'string') {
    // Never capture values that look like prompts or model outputs (very long strings)
    if (value.length > 2000) return `[string truncated, length=${value.length}]`;
    return scrubString(value);
  }
  if (Array.isArray(value)) {
    return value.slice(0, 10).map(item => scrubValue(item, depth + 1));
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      // Drop keys that typically hold PII or sensitive user data
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('prompt') ||
        lowerKey.includes('response') ||
        lowerKey.includes('content') ||
        lowerKey.includes('message') ||
        lowerKey.includes('input') ||
        lowerKey.includes('output') ||
        lowerKey.includes('text') ||
        lowerKey.includes('body') ||
        lowerKey.includes('data') ||
        lowerKey.includes('payload') ||
        lowerKey.includes('token') ||
        lowerKey.includes('key') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('password') ||
        lowerKey.includes('auth') ||
        lowerKey.includes('cookie')
      ) {
        result[key] = '[SCRUBBED]';
      } else {
        result[key] = scrubValue(val, depth + 1);
      }
    }
    return result;
  }
  return value;
}

/**
 * The Sentry `beforeSend` hook — the privacy guardian.
 * This runs synchronously before every event leaves the process.
 * It sanitizes all event fields and drops events that appear to carry user data.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function beforeSend(event: any): any | null {
  try {
    // Scrub the exception values (stack traces, values)
    if (event.exception?.values) {
      for (const exc of event.exception.values) {
        if (exc.value && typeof exc.value === 'string') {
          exc.value = scrubString(exc.value);
        }
        // Never send local variable values in stack frames
        if (exc.stacktrace?.frames) {
          for (const frame of exc.stacktrace.frames) {
            frame.vars = undefined;
            frame.pre_context = undefined;
            frame.context_line = undefined;
            frame.post_context = undefined;
          }
        }
      }
    }

    // Scrub top-level message
    if (event.message && typeof event.message === 'string') {
      event.message = scrubString(event.message);
    }

    // Remove all breadcrumbs (may contain user actions / prompts)
    event.breadcrumbs = undefined;

    // Scrub extra (arbitrary data attached to events)
    if (event.extra) {
      event.extra = scrubValue(event.extra) as Record<string, unknown>;
    }

    // Scrub request headers (authorization, cookies, etc.)
    if (event.request) {
      event.request.data = undefined;
      event.request.cookies = undefined;
      event.request.query_string = undefined;
      if (event.request.headers) {
        event.request.headers = scrubValue(event.request.headers);
      }
    }

    // Scrub user info (don't send user identifiers)
    event.user = undefined;

    return event;
  } catch {
    // If scrubbing itself throws, drop the event rather than send unscrubbed data
    return null;
  }
}

/**
 * Initialize Sentry telemetry.
 * This is a no-op if `SENTRY_DSN` is not set in the environment.
 * Should be called early in startup, after config is loaded.
 */
export async function initSentry(): Promise<void> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    logForDebugging('[Sentry] SENTRY_DSN not set — telemetry disabled (no-op mode)');
    return;
  }

  try {
    const Sentry = await import('@sentry/node');
    Sentry.init({
      dsn,
      // Disable automatic data collection that might capture user data
      autoSessionTracking: false,
      sendDefaultPii: false,
      // Only send errors, not performance traces (no profiling)
      tracesSampleRate: 0,
      profilesSampleRate: 0,
      // Privacy guardian
      beforeSend,
      // Short timeout so shutdown flush doesn't hang
      shutdownTimeout: 2000,
      // Release + environment for correlation in Sentry dashboard
      release: typeof MACRO !== 'undefined' && MACRO.VERSION ? `claudecode@${MACRO.VERSION}` : undefined,
      environment: process.env.NODE_ENV ?? 'production',
      // Disable default integrations that may capture too much
      defaultIntegrations: false,
      integrations: [],
    });

    sentryClient = Sentry;
    sentryInitialized = true;
    logForDebugging(`[Sentry] Initialized with DSN (masked): ${getMaskedSentryDsn()}`);
  } catch (err) {
    // Sentry failing to initialize must never crash the app
    logForDebugging(`[Sentry] Failed to initialize: ${err instanceof Error ? err.message : String(err)}`, {
      level: 'warn',
    });
  }
}

/**
 * Capture an exception and send it to Sentry (if enabled).
 * Safe to call even when Sentry is disabled — it becomes a no-op.
 */
export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (!sentryInitialized || !sentryClient) return;
  try {
    sentryClient.withScope((scope: unknown) => {
      if (context && typeof scope === 'object' && scope !== null && 'setExtra' in scope) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const s = scope as any;
        // Scrub the context before attaching to scope
        const scrubbed = scrubValue(context) as Record<string, unknown>;
        for (const [key, val] of Object.entries(scrubbed)) {
          s.setExtra(key, val);
        }
      }
      sentryClient.captureException(error);
    });
  } catch {
    // Never let Sentry crash the app
  }
}

/**
 * Capture a non-error message/event (no-op when Sentry is disabled).
 */
export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
  if (!sentryInitialized || !sentryClient) return;
  try {
    sentryClient.captureMessage(scrubString(message), level);
  } catch {
    // Never let Sentry crash the app
  }
}

/**
 * Flush all pending Sentry events and close the client.
 * Should be called during graceful shutdown to ensure events are flushed before process exits.
 *
 * @param timeoutMs Maximum time to wait for flush before giving up (default: 2000ms)
 */
export async function closeSentry(timeoutMs = 2000): Promise<void> {
  if (!sentryInitialized || !sentryClient) return;
  try {
    logForDebugging('[Sentry] Flushing and closing...');
    await sentryClient.close(timeoutMs);
    logForDebugging('[Sentry] Closed.');
  } catch {
    // Ignore errors during shutdown flush
  } finally {
    sentryClient = null;
    sentryInitialized = false;
  }
}
