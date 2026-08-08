/**
 * Server-side logger with a small leveled API. Writes to stderr so stdout
 * stays clean for protocol traffic.
 */
export type ServerLogger = {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
};

export function createServerLogger(): ServerLogger {
  const write = (level: string, msg: string, meta?: Record<string, unknown>) => {
    const suffix = meta && Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    process.stderr.write(`[server:${level}] ${msg}${suffix}\n`);
  };
  return {
    debug: (msg, meta) => write('debug', msg, meta),
    info: (msg, meta) => write('info', msg, meta),
    warn: (msg, meta) => write('warn', msg, meta),
    error: (msg, meta) => write('error', msg, meta),
  };
}
