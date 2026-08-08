import type { ServerLogger } from './serverLog.js';
import type { SessionManager } from './sessionManager.js';
import type { ServerConfig } from './types.js';

export type RunningServer = {
  /** Actual bound port (differs from config.port when 0 = auto-assign). */
  port: number | undefined;
  stop(force: boolean): void;
};

/**
 * Start the HTTP server for `claude server`. Sessions are managed through the
 * provided SessionManager; the server exposes a minimal health endpoint plus
 * a connect endpoint used by `claude --connect`.
 */
export function startServer(config: ServerConfig, sessionManager: SessionManager, logger: ServerLogger): RunningServer {
  const server = Bun.serve({
    port: config.port,
    hostname: config.host,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === '/health') {
        return new Response(JSON.stringify({ ok: true, pid: process.pid }), {
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.pathname === '/connect' && req.method === 'POST') {
        try {
          const body = (await req.json()) as { session_id?: string; work_dir?: string };
          const sessionId = body.session_id ?? crypto.randomUUID();
          const workDir = body.work_dir ?? config.workspace ?? process.cwd();
          await sessionManager.create(sessionId, workDir);
          return new Response(JSON.stringify({ session_id: sessionId }), {
            headers: { 'content-type': 'application/json' },
          });
        } catch (err) {
          logger.error(`connect failed: ${err instanceof Error ? err.message : String(err)}`);
          return new Response(JSON.stringify({ error: 'connect failed' }), { status: 500 });
        }
      }
      return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
    },
  });

  logger.info(`listening on ${config.host}:${server.port}`);

  return {
    port: server.port,
    stop(force: boolean) {
      if (force) {
        process.exit(0);
      }
      server.stop();
    },
  };
}
