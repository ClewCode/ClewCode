import { appendFile, mkdir, symlink, unlink } from 'fs/promises';
import memoize from 'lodash-es/memoize.js';
import { dirname, join } from 'path';
import { getSessionId } from 'src/bootstrap/state.js';
import { createBufferedWriter } from './bufferedWriter.js';
import { registerCleanup } from './cleanupRegistry.js';
import { parseDebugFilter, shouldShowDebugMessage } from './debugFilter.js';
import { getClaudeConfigHomeDir, isEnvTruthy } from './envUtils.js';
import { getFsImplementation } from './fsOperations.js';
import { writeToStderr } from './process.js';
import { jsonStringify } from './slowOperations.js';

const LEVEL_ORDER = {
  verbose: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
};
/**
 * Minimum log level to include in debug output. Defaults to 'debug', which
 * filters out 'verbose' messages. Set CLAUDE_CODE_DEBUG_LOG_LEVEL=verbose to
 * include high-volume diagnostics (e.g. full statusLine command, shell, cwd,
 * stdout/stderr) that would otherwise drown out useful debug output.
 */
export const getMinDebugLogLevel = memoize(() => {
  const raw = process.env.CLAUDE_CODE_DEBUG_LOG_LEVEL?.toLowerCase().trim();
  if (raw && Object.hasOwn(LEVEL_ORDER, raw)) {
    return raw;
  }
  return 'debug';
});
let runtimeDebugEnabled = false;
export const isDebugMode = memoize(() => {
  return (
    runtimeDebugEnabled ||
    isEnvTruthy(process.env.DEBUG) ||
    isEnvTruthy(process.env.DEBUG_SDK) ||
    process.argv.includes('--debug') ||
    process.argv.includes('-d') ||
    isDebugToStdErr() ||
    // Also check for --debug=pattern syntax
    process.argv.some(arg => arg.startsWith('--debug=')) ||
    // --debug-file implicitly enables debug mode
    getDebugFilePath() !== null
  );
});
/**
 * Enables debug logging mid-session (e.g. via /debug). Non-ants don't write
 * debug logs by default, so this lets them start capturing without restarting
 * with --debug. Returns true if logging was already active.
 */
export function enableDebugLogging() {
  const wasActive = isDebugMode() || process.env.USER_TYPE === 'ant';
  runtimeDebugEnabled = true;
  isDebugMode.cache.clear?.();
  return wasActive;
}
// Extract and parse debug filter from command line arguments
// Exported for testing purposes
export const getDebugFilter = memoize(() => {
  // Look for --debug=pattern in argv
  const debugArg = process.argv.find(arg => arg.startsWith('--debug='));
  if (!debugArg) {
    return null;
  }
  // Extract the pattern after the equals sign
  const filterPattern = debugArg.substring('--debug='.length);
  return parseDebugFilter(filterPattern);
});
export const isDebugToStdErr = memoize(() => {
  return process.argv.includes('--debug-to-stderr') || process.argv.includes('-d2e');
});
export const getDebugFilePath = memoize(() => {
  for (let i = 0; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg.startsWith('--debug-file=')) {
      return arg.substring('--debug-file='.length);
    }
    if (arg === '--debug-file' && i + 1 < process.argv.length) {
      return process.argv[i + 1];
    }
  }
  return null;
});
function shouldLogDebugMessage(message) {
  if (process.env.NODE_ENV === 'test' && !isDebugToStdErr()) {
    return false;
  }
  // Non-ants only write debug logs when debug mode is active (via --debug at
  // startup or /debug mid-session). Ants always log for /share, bug reports.
  if (process.env.USER_TYPE !== 'ant' && !isDebugMode()) {
    return false;
  }
  if (
    typeof process === 'undefined' ||
    typeof process.versions === 'undefined' ||
    typeof process.versions.node === 'undefined'
  ) {
    return false;
  }
  const filter = getDebugFilter();
  return shouldShowDebugMessage(message, filter);
}
let hasFormattedOutput = false;
export function setHasFormattedOutput(value) {
  hasFormattedOutput = value;
}
export function getHasFormattedOutput() {
  return hasFormattedOutput;
}
let debugWriter = null;
let pendingWrite = Promise.resolve();
// Module-level so .bind captures only its explicit args, not the
// writeFn closure's parent scope (Jarred, #22257).
async function appendAsync(needMkdir, dir, path, content) {
  if (needMkdir) {
    await mkdir(dir, { recursive: true }).catch(() => {});
  }
  await appendFile(path, content);
  void updateLatestDebugLogSymlink();
}
function noop() {}
function getDebugWriter() {
  if (!debugWriter) {
    let ensuredDir = null;
    debugWriter = createBufferedWriter({
      writeFn: content => {
        const path = getDebugLogPath();
        const dir = dirname(path);
        const needMkdir = ensuredDir !== dir;
        ensuredDir = dir;
        if (isDebugMode()) {
          // immediateMode: must stay sync. Async writes are lost on direct
          // process.exit() and keep the event loop alive in beforeExit
          // handlers (infinite loop with Perfetto tracing). See #22257.
          if (needMkdir) {
            try {
              getFsImplementation().mkdirSync(dir);
            } catch {
              // Directory already exists
            }
          }
          getFsImplementation().appendFileSync(path, content);
          void updateLatestDebugLogSymlink();
          return;
        }
        // Buffered path (ants without --debug): flushes ~1/sec so chain
        // depth stays ~1. .bind over a closure so only the bound args are
        // retained, not this scope.
        pendingWrite = pendingWrite.then(appendAsync.bind(null, needMkdir, dir, path, content)).catch(noop);
      },
      flushIntervalMs: 1000,
      maxBufferSize: 100,
      immediateMode: isDebugMode(),
    });
    registerCleanup(async () => {
      debugWriter?.dispose();
      await pendingWrite;
    });
  }
  return debugWriter;
}
export async function flushDebugLogs() {
  debugWriter?.flush();
  await pendingWrite;
}
export function logForDebugging(
  message,
  { level } = {
    level: 'debug',
  },
) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[getMinDebugLogLevel()]) {
    return;
  }
  if (!shouldLogDebugMessage(message)) {
    return;
  }
  // Multiline messages break the jsonl output format, so make any multiline messages JSON.
  if (hasFormattedOutput && message.includes('\n')) {
    message = jsonStringify(message);
  }
  const timestamp = new Date().toISOString();
  const output = `${timestamp} [${level.toUpperCase()}] ${message.trim()}\n`;
  if (isDebugToStdErr()) {
    writeToStderr(output);
    return;
  }
  getDebugWriter().write(output);
}
export function getDebugLogPath() {
  return (
    getDebugFilePath() ??
    process.env.CLAUDE_CODE_DEBUG_LOGS_DIR ??
    join(getClaudeConfigHomeDir(), 'debug', `${getSessionId()}.txt`)
  );
}
/**
 * Updates the latest debug log symlink to point to the current debug log file.
 * Creates or updates a symlink at ~/.claude/debug/latest
 */
const updateLatestDebugLogSymlink = memoize(async () => {
  try {
    const debugLogPath = getDebugLogPath();
    const debugLogsDir = dirname(debugLogPath);
    const latestSymlinkPath = join(debugLogsDir, 'latest');
    await unlink(latestSymlinkPath).catch(() => {});
    await symlink(debugLogPath, latestSymlinkPath);
  } catch {
    // Silently fail if symlink creation fails
  }
});
/**
 * Logs errors for Ants only, always visible in production.
 */
export function logAntError(context, error) {
  if (process.env.USER_TYPE !== 'ant') {
    return;
  }
  if (error instanceof Error && error.stack) {
    logForDebugging(`[ANT-ONLY] ${context} stack trace:\n${error.stack}`, {
      level: 'error',
    });
  }
}
