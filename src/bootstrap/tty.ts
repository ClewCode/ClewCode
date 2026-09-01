// biome-ignore-all lint/suspicious/noEmptyBlockStatements: keepalive noops
// Extracted from main.tsx — TTY hacks must run before any other imports (side-effect on import)
export const startupArgs = setupTty();

export function setupTty(): string[] {
  Object.defineProperty(process.stdout, 'isTTY', { value: true, writable: true, configurable: true });
  Object.defineProperty(process.stderr, 'isTTY', { value: true, writable: true, configurable: true });
  const startupArgs = process.argv.slice(2);
  let windowsInteractiveKeepAlive: ReturnType<typeof setInterval> | undefined;
  if (process.platform === 'win32' && startupArgs.length === 0) {
    windowsInteractiveKeepAlive = setInterval(() => {}, 60_000);
  }
  try {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, writable: true, configurable: true });
    if (typeof process.stdin.ref !== 'function') {
      let stdinKeepAlive: ReturnType<typeof setInterval> | undefined;
      process.stdin.ref = () => {
        stdinKeepAlive ??= setInterval(() => {}, 60_000);
        return process.stdin;
      };
      process.stdin.unref = () => {
        if (stdinKeepAlive) {
          clearInterval(stdinKeepAlive);
          stdinKeepAlive = undefined;
        }
        if (windowsInteractiveKeepAlive) {
          clearInterval(windowsInteractiveKeepAlive);
          windowsInteractiveKeepAlive = undefined;
        }
        return process.stdin;
      };
    }
    if (typeof process.stdin.setRawMode !== 'function') {
      process.stdin.setRawMode = (_mode: boolean) => process.stdin;
    }
  } catch (_e) {
    /* ignore */
  }
  return startupArgs;
}
