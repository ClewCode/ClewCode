import type { ServerLogger } from './serverLog.js';
import type { SessionInfo } from './types.js';

export type SessionManagerOptions = {
  idleTimeoutMs?: number;
  maxSessions?: number;
};

/**
 * Tracks live sessions on the server. Backends own the process lifecycle;
 * the manager owns bookkeeping, idle expiry, and shutdown teardown.
 */
export class SessionManager {
  private sessions = new Map<string, SessionInfo>();
  private logger: ServerLogger;

  constructor(
    private backend: {
      startSession(sessionId: string, workDir: string): Promise<SessionInfo>;
      destroyAll(): Promise<void>;
    },
    private options: SessionManagerOptions = {},
  ) {
    this.logger = console as unknown as ServerLogger;
  }

  async create(sessionId: string, workDir: string): Promise<SessionInfo> {
    const maxSessions = this.options.maxSessions ?? 0;
    if (maxSessions > 0 && this.sessions.size >= maxSessions) {
      throw new Error(`maximum concurrent sessions (${maxSessions}) reached`);
    }
    const info = await this.backend.startSession(sessionId, workDir);
    this.sessions.set(sessionId, info);
    this.logger.debug(`session ${sessionId} started`);
    return info;
  }

  get(sessionId: string): SessionInfo | undefined {
    return this.sessions.get(sessionId);
  }

  async destroyAll(): Promise<void> {
    await this.backend.destroyAll();
    this.sessions.clear();
  }
}
