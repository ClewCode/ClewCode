import type { SSHManagerCallbacks } from './createSSHSession.js';

/**
 * Bridges an SSH session's streamed messages/permission requests into the
 * REPL. One manager instance is created per SSH session via
 * `SSHSession.createManager()`.
 */
export interface SSHSessionManager {
  start(): void;
  stop(): void;
  sendMessage(content: unknown): Promise<boolean>;
  cancelRequest(): void;
}

export function createSSHSessionManager(callbacks: SSHManagerCallbacks): SSHSessionManager {
  return {
    start() {},
    stop() {},
    async sendMessage() {
      return true;
    },
    cancelRequest() {
      void callbacks;
    },
  };
}
