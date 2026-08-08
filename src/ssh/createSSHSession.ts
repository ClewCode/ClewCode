import type { ChildProcess } from 'child_process';

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

export type SSHManagerCallbacks = {
  onMessage: (sdkMessage: unknown) => void;
  onPermissionRequest: (
    request: {
      tool_name: string;
      description?: string;
      permission_suggestions?: string;
      blocked_path?: string;
      tool_use_id: string;
      input: unknown;
    },
    requestId: string,
  ) => void;
};

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
  // @ts-expect-error
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
    proxy: { stop() {} },
    getStderrTail: () => '',
    createManager: () => ({
      start() {},
      stop() {},
      sendMessage() {
        return Promise.resolve(true);
      },
      cancelRequest() {},
    }),
  };
}
