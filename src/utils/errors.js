import { APIUserAbortError } from '@anthropic-ai/sdk';
export class ClaudeError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
  }
}
export class MalformedCommandError extends Error {}
export class AbortError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AbortError';
  }
}
/**
 * True iff `e` is any of the abort-shaped errors the codebase encounters:
 * our AbortError class, a DOMException from AbortController.abort()
 * (.name === 'AbortError'), or the SDK's APIUserAbortError. The SDK class
 * is checked via instanceof because minified builds mangle class names —
 * constructor.name becomes something like 'nJT' and the SDK never sets
 * this.name, so string matching silently fails in production.
 */
export function isAbortError(e) {
  return e instanceof AbortError || e instanceof APIUserAbortError || (e instanceof Error && e.name === 'AbortError');
}
/**
 * Custom error class for configuration file parsing errors
 * Includes the file path and the default configuration that should be used
 */
export class ConfigParseError extends Error {
  filePath;
  defaultConfig;
  constructor(message, filePath, defaultConfig) {
    super(message);
    this.name = 'ConfigParseError';
    this.filePath = filePath;
    this.defaultConfig = defaultConfig;
  }
}
export class ShellError extends Error {
  stdout;
  stderr;
  code;
  interrupted;
  constructor(stdout, stderr, code, interrupted) {
    super('Shell command failed');
    this.stdout = stdout;
    this.stderr = stderr;
    this.code = code;
    this.interrupted = interrupted;
    this.name = 'ShellError';
  }
}
export class TeleportOperationError extends Error {
  formattedMessage;
  constructor(message, formattedMessage) {
    super(message);
    this.formattedMessage = formattedMessage;
    this.name = 'TeleportOperationError';
  }
}
/**
 * Error with a message that is safe to log to telemetry.
 * Use the long name to confirm you've verified the message contains no
 * sensitive data (file paths, URLs, code snippets).
 *
 * Single-arg: same message for user and telemetry
 * Two-arg: different messages (e.g., full message has file path, telemetry doesn't)
 *
 * @example
 * // Same message for both
 * throw new TelemetrySafeError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS(
 *   'MCP server "slack" connection timed out'
 * )
 *
 * // Different messages
 * throw new TelemetrySafeError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS(
 *   `MCP tool timed out after ${ms}ms`,  // Full message for logs/user
 *   'MCP tool timed out'                  // Telemetry message
 * )
 */
export class TelemetrySafeError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS extends Error {
  telemetryMessage;
  constructor(message, telemetryMessage) {
    super(message);
    this.name = 'TelemetrySafeError';
    this.telemetryMessage = telemetryMessage ?? message;
  }
}
export function hasExactErrorMessage(error, message) {
  return error instanceof Error && error.message === message;
}
/**
 * Normalize an unknown value into an Error.
 * Use at catch-site boundaries when you need an Error instance.
 */
export function toError(e) {
  return e instanceof Error ? e : new Error(String(e));
}
/**
 * Extract a string message from an unknown error-like value.
 * Use when you only need the message (e.g., for logging or display).
 */
export function errorMessage(e) {
  return e instanceof Error ? e.message : String(e);
}
/**
 * Extract the errno code (e.g., 'ENOENT', 'EACCES') from a caught error.
 * Returns undefined if the error has no code or is not an ErrnoException.
 * Replaces the `(e as NodeJS.ErrnoException).code` cast pattern.
 */
export function getErrnoCode(e) {
  if (e && typeof e === 'object' && 'code' in e && typeof e.code === 'string') {
    return e.code;
  }
  return undefined;
}
/**
 * True if the error is ENOENT (file or directory does not exist).
 * Replaces `(e as NodeJS.ErrnoException).code === 'ENOENT'`.
 */
export function isENOENT(e) {
  return getErrnoCode(e) === 'ENOENT';
}
/**
 * Extract the errno path (the filesystem path that triggered the error)
 * from a caught error. Returns undefined if the error has no path.
 * Replaces the `(e as NodeJS.ErrnoException).path` cast pattern.
 */
export function getErrnoPath(e) {
  if (e && typeof e === 'object' && 'path' in e && typeof e.path === 'string') {
    return e.path;
  }
  return undefined;
}
/**
 * Extract error message + top N stack frames from an unknown error.
 * Use when the error flows to the model as a tool_result — full stack
 * traces are ~500-2000 chars of mostly-irrelevant internal frames and
 * waste context tokens. Keep the full stack in debug logs instead.
 */
export function shortErrorStack(e, maxFrames = 5) {
  if (!(e instanceof Error)) return String(e);
  if (!e.stack) return e.message;
  // V8/Bun stack format: "Name: message\n    at frame1\n    at frame2..."
  // First line is the message; subsequent "    at " lines are frames.
  const lines = e.stack.split('\n');
  const header = lines[0] ?? e.message;
  const frames = lines.slice(1).filter(l => l.trim().startsWith('at '));
  if (frames.length <= maxFrames) return e.stack;
  return [header, ...frames.slice(0, maxFrames)].join('\n');
}
/**
 * True if the error means the path is missing, inaccessible, or
 * structurally unreachable — use in catch blocks after fs operations to
 * distinguish expected "nothing there / no access" from unexpected errors.
 *
 * Covers:
 *  ENOENT    — path does not exist
 *  EACCES    — permission denied
 *  EPERM     — operation not permitted
 *  ENOTDIR   — a path component is not a directory (e.g. a file named
 *              `.claude` exists where a directory is expected)
 *  ELOOP     — too many symlink levels (circular symlinks)
 */
export function isFsInaccessible(e) {
  const code = getErrnoCode(e);
  return code === 'ENOENT' || code === 'EACCES' || code === 'EPERM' || code === 'ENOTDIR' || code === 'ELOOP';
}
/**
 * Check if an error is a fetch/HTTP error with a response property.
 * Works with both FetchError (ofetch) and AxiosError shapes.
 */
export function isFetchError(e) {
  if (!e || typeof e !== 'object') return false;
  // ofetch FetchError
  if ('name' in e && e.name === 'FetchError') return true;
  // Generic HTTP error with response
  if ('response' in e && e.response && typeof e.response === 'object') return true;
  return false;
}

/**
 * Check if an error is an abort/cancellation error (e.g., AbortController signal).
 */
export function isCancelError(e) {
  if (!e || typeof e !== 'object') return false;
  // DOMException AbortError
  if (typeof DOMException !== 'undefined' && e instanceof DOMException && e.name === 'AbortError') return true;
  // Error with name AbortError
  if ('name' in e && e.name === 'AbortError') return true;
  return false;
}

/**
 * Classify a caught error from an axios request into one of a few buckets.
 * Replaces the ~20-line isAxiosError → 401/403 → ECONNABORTED → ECONNREFUSED
 * chain duplicated across sync-style services (settingsSync, policyLimits,
 * remoteManagedSettings, teamMemorySync).
 *
 * Checks the `.isAxiosError` marker property directly (same as
 * isFetchError()) to keep this module dependency-free.
 */
export function classifyAxiosError(e) {
  const message = errorMessage(e);
  if (!e || typeof e !== 'object' || !('isAxiosError' in e) || !e.isAxiosError) {
    return { kind: 'other', message };
  }
  const err = e;
  const status = err.response?.status;
  if (status === 401 || status === 403) return { kind: 'auth', status, message };
  if (err.code === 'ECONNABORTED') return { kind: 'timeout', status, message };
  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
    return { kind: 'network', status, message };
  }
  return { kind: 'http', status, message };
}
