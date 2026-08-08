import type { SessionInfo } from '../types.js';

/**
 * Backend that runs every session as a child process of this server. This is
 * the default (and least isolated) backend — used by `claude server`.
 */
export class DangerousBackend {
  private sessions = new Map<string, SessionInfo>();

  async startSession(sessionId: string, workDir: string): Promise<SessionInfo> {
    const info: SessionInfo = {
      id: sessionId,
      status: 'starting',
      createdAt: Date.now(),
      workDir,
      process: null,
    };
    this.sessions.set(sessionId, info);
    return info;
  }

  async destroyAll(): Promise<void> {
    for (const session of this.sessions.values()) {
      if (session.process && !session.process.killed) {
        session.process.kill();
      }
    }
    this.sessions.clear();
  }
}
