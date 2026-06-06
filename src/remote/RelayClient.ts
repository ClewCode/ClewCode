/**
 * RelayClient — Connects to a self-hosted relay server for
 * NAT-traversal support in Bridge v2.
 *
 * In relay mode, both the host and the remote connect to the same
 * relay server. The relay forwards messages between the two peers.
 *
 * Relay protocol (simple JSON over WebSocket):
 *   - Register as 'listener' or 'connector'
 *   - Listener: sends `{ type: "register", role: "listener", token: "..." }`
 *   - Connector: sends `{ type: "register", role: "connector", token: "..." }`
 *   - After pairing, messages are forwarded bidirectionally
 */

import { logForDebugging } from '../utils/debug.js';
import { errorMessage } from '../utils/errors.js';

export type RelayRole = 'listener' | 'connector';

export type RelayCallbacks = {
  onMessage: (data: string) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (error: Error) => void;
};

export class RelayClient {
  private ws: WebSocket | null = null;
  private role: RelayRole;
  private relayUrl: string;
  private token: string;
  private callbacks: RelayCallbacks;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = true;

  constructor(relayUrl: string, role: RelayRole, token: string, callbacks: RelayCallbacks) {
    this.relayUrl = relayUrl;
    this.role = role;
    this.token = token;
    this.callbacks = callbacks;
  }

  /**
   * Connect to the relay server.
   */
  connect(): void {
    this.shouldReconnect = true;
    this.doConnect();
  }

  /**
   * Disconnect from the relay server.
   */
  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
  }

  /**
   * Send a message to the paired peer via relay.
   */
  send(data: string): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    try {
      this.ws.send(data);
      return true;
    } catch {
      return false;
    }
  }

  private doConnect(): void {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
    }

    try {
      this.ws = new WebSocket(this.relayUrl);

      this.ws.onopen = () => {
        logForDebugging(`[RelayClient] Connected to relay as ${this.role}`);

        // Register with the relay
        this.ws!.send(
          JSON.stringify({
            type: 'register',
            role: this.role,
            token: this.token,
          }),
        );

        this.callbacks.onConnected?.();
      };

      this.ws.onmessage = (event: MessageEvent) => {
        const data = typeof event.data === 'string' ? event.data : '';
        this.callbacks.onMessage(data);
      };

      this.ws.onclose = () => {
        this.ws = null;
        this.callbacks.onDisconnected?.();
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.callbacks.onError?.(new Error('Relay WebSocket error'));
      };
    } catch (err) {
      this.callbacks.onError?.(new Error(`Failed to connect to relay: ${errorMessage(err)}`));
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect) return;
    this.reconnectTimer = setTimeout(() => {
      this.doConnect();
    }, 5_000);
  }
}
