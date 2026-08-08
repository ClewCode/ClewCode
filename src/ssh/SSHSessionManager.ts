/**
 * The manager contract `useSSHSession` drives.
 *
 * This file was referenced by `useSSHSession.ts` and by `createSSHSession.ts`
 * but never existed, so the type import dangled and `SSHSession.createManager`
 * carried a `@ts-expect-error` to hide it. The shape here is taken from what
 * the hook actually calls, not invented: `connect`, `disconnect`,
 * `sendMessage`, `sendInterrupt`, and `respondToPermissionRequest`.
 *
 * Declaring it as an interface keeps the real transport (an ssh child process
 * plus the unix-socket auth proxy) and the local test double honest against
 * one definition.
 */
import type { RemoteMessageContent } from '../utils/teleport/api.js';

/** A permission answer travelling back to the remote session. */
export type SSHPermissionResponse =
  | { behavior: 'allow'; updatedInput?: unknown }
  | { behavior: 'deny'; message: string };

/** Events the manager raises at its owner. */
export type SSHSessionManagerCallbacks = {
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
  onConnected?: () => void;
  /** The link dropped and a retry is under way; any in-flight turn is lost. */
  onReconnecting?: (attempt: number, max: number) => void;
  /** The session is finished and will not come back. */
  onDisconnected?: () => void;
  onError?: (error: Error) => void;
};

export interface SSHSessionManager {
  /** Begin the session. Safe to call once per manager. */
  connect(): void;

  /** End the session and release the transport. Safe to call more than once. */
  disconnect(): void;

  /** Send user input. Resolves false when there is no live session to send on. */
  sendMessage(content: RemoteMessageContent): Promise<boolean>;

  /** Interrupt the turn in progress, leaving the session connected. */
  sendInterrupt(): void;

  /** Answer a pending `onPermissionRequest`, by the `requestId` it carried. */
  respondToPermissionRequest(requestId: string, response: SSHPermissionResponse): void;
}

/**
 * Compile-time conformance check for a manager implementation.
 *
 * Nothing runs; a factory that drifts from {@link SSHSessionManager} fails to
 * typecheck where it is defined rather than at the call site in the hook —
 * which is exactly how the previous mismatch went unnoticed (the local double
 * exposed `start`/`stop`/`cancelRequest` while the hook called
 * `connect`/`disconnect`/`sendInterrupt`).
 */
export function asSSHSessionManager<T extends SSHSessionManager>(implementation: T): T {
  return implementation;
}
