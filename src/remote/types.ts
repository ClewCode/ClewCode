/**
 * Types for Bridge v2 — provider-agnostic Remote Control.
 *
 * Defines config, session info, and token types used by the
 * RemoteServer, RelayClient, and CLI commands.
 */

/** Connection mode for the remote session. */
export type RemoteMode = 'direct' | 'relay';

/** Runtime config for the RemoteServer (listener side). */
export type RemoteServerConfig = {
  /** Host to bind to (default: '0.0.0.0' or '127.0.0.1'). */
  host: string;
  /** Port to listen on (default: 0 = random). */
  port: number;
  /** Auth token required for incoming connections. */
  authToken: string;
  /** Optional relay server URL (for relay mode). */
  relayUrl?: string;
  /** Max concurrent sessions (default: 8). */
  maxSessions: number;
  /** Session idle timeout in ms (default: 30 min). 0 = never expire. */
  idleTimeoutMs: number;
};

/** Session state lifecycle. */
export type SessionState = 'starting' | 'running' | 'detached' | 'stopping' | 'stopped';

/** Info about a single remote session. */
export type SessionInfo = {
  id: string;
  state: SessionState;
  createdAt: number;
  lastActivityAt: number;
  /** Human-readable label (optional, set by the client). */
  label?: string;
};

/** A stored one-time auth token. */
export type TokenEntry = {
  id: string;
  /** bcrypt-style hash (or SHA-256 hex) of the raw token. */
  hash: string;
  /** Human-readable description (e.g. 'work-laptop'). */
  label: string;
  createdAt: number;
  /** When the token was consumed (used once). Null = unused. */
  consumedAt: number | null;
  /** When this token expires. Null = never. */
  expiresAt: number | null;
};

/** Response from the session creation endpoint. */
export type SessionCreateResponse = {
  session_id: string;
  ws_url: string;
  work_dir?: string;
};

/** Message envelope forwarded over the WebSocket bridge. */
export type RemoteMessage = {
  type: 'user' | 'assistant' | 'system' | 'control_request' | 'control_response' | 'control_cancel_request';
  uuid?: string;
  session_id?: string;
  message?: unknown;
  request?: unknown;
  response?: unknown;
  request_id?: string;
};

/** Callbacks for RemoteServer session events. */
export type RemoteServerCallbacks = {
  onSessionStart?: (sessionId: string) => void;
  onSessionEnd?: (sessionId: string) => void;
  onMessage?: (sessionId: string, message: RemoteMessage) => void;
  onError?: (error: Error) => void;
};
