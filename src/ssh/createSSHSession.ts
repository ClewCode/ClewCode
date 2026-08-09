import type { ChildProcess } from 'child_process';
import { asSSHSessionManager, type SSHSessionManager, type SSHSessionManagerCallbacks } from './SSHSessionManager.js';

export type SSHCreateSessionConfig = {
  host?: string;
  cwd?: string;
  localVersion?: string;
  permissionMode?: string;
  dangerouslySkipPermissions?: boolean;
  extraCliArgs?: string[];
};

export type SSHSessionCallbacks = {
  onProgress?: (msg: string) => void;
};

/**
 * Callbacks accepted by {@link SSHSession.createManager}.
 *
 * Aliased to the manager's own definition so the two cannot drift: this file
 * previously declared a narrower copy that omitted the lifecycle callbacks
 * (`onConnected`, `onReconnecting`, `onDisconnected`, `onError`) the consumer
 * has always passed.
 */
export type SSHManagerCallbacks = SSHSessionManagerCallbacks;

export class SSHSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SSHSessionError';
  }
}

/**
 * A live `claude ssh` session: the remote process plus the local auth proxy
 * that forwards permission decisions back over the unix socket.
 */
export type SSHSession = {
  remoteCwd: string;
  proc: ChildProcess;
  proxy: { stop(): void };
  getStderrTail(): string;
  createManager(callbacks: SSHManagerCallbacks): SSHSessionManager;
};

/**
 * Creates a session connecting to a remote host over ssh (with binary
 * deploy + unix-socket auth proxy). This is the full remote path.
 */
export async function createSSHSession(
  config: SSHCreateSessionConfig,
  callbacks?: SSHSessionCallbacks,
): Promise<SSHSession> {
  if (!config.host) {
    throw new SSHSessionError('SSH session requires a host');
  }
  callbacks?.onProgress?.(`connecting to ${config.host}`);
  // The full implementation spawns `ssh -R` with a socket forwarded to the
  // local auth proxy. The session shell type below keeps the contract; the
  // remote process is spawned by the caller in the interactive path.
  throw new SSHSessionError(
    'Remote SSH sessions are not supported in this build. Use --local for a local ssh-proxy test session.',
  );
}

/**
 * Creates a local-only session used to e2e-test the proxy/auth plumbing
 * without an actual remote host.
 */
export function createLocalSSHSession(config: SSHCreateSessionConfig): SSHSession {
  const proc = {} as ChildProcess;
  return {
    remoteCwd: config.cwd ?? process.cwd(),
    proc,
    proxy: {
      stop() {
        // No remote process exists in the local test session.
      },
    },
    getStderrTail: () => '',
    // A do-nothing double for the proxy/auth e2e path. It answers the same
    // calls the real manager does — the previous version exposed
    // start/stop/cancelRequest, which the hook never calls, so every
    // interaction with it was a silent no-op.
    createManager: () =>
      asSSHSessionManager({
        connect() {
          // Local test session does not connect to a remote host.
        },
        disconnect() {
          // Local test session has no remote connection to close.
        },
        sendMessage() {
          return Promise.resolve(true);
        },
        sendInterrupt() {
          // Local test session has no remote interrupt target.
        },
        respondToPermissionRequest() {
          // Local test session has no remote permission request.
        },
      }),
  };
}
