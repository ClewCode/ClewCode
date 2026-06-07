/**
 * RemoteConnector — Connect to a remote host and send commands.
 *
 * Usage (connector side):
 *   /remote connect ws://relay:8080 --token xyz --relay
 *
 * After connecting, type commands. They'll be executed on the host.
 */

import { RelayClient } from './RelayClient.js';
import type { RemoteMessage } from './types.js';

export type ConnectorCallbacks = {
  onConnected?: () => void;
  onDisconnected?: () => void;
  onResult?: (result: { status: string; output?: string; error?: string }) => void;
  onError?: (error: string) => void;
};

export class RemoteConnector {
  private relay: RelayClient | null = null;
  private callbacks: ConnectorCallbacks;

  constructor(callbacks: ConnectorCallbacks) {
    this.callbacks = callbacks;
  }

  /** Connect to a remote host via relay */
  connect(relayUrl: string, token: string): void {
    this.relay = new RelayClient(relayUrl, 'connector', token, {
      onMessage: (data: string) => {
        try {
          const msg = JSON.parse(data) as RemoteMessage & { message?: { status: string; output?: string; error?: string } };

          if (msg.type === 'paired') {
            this.callbacks.onConnected?.();
          } else if (msg.type === 'assistant' && msg.message) {
            this.callbacks.onResult?.(msg.message);
          } else if (msg.type === 'system' && msg.message) {
            // Status update (e.g., "executing")
          }
        } catch { /* ignore */ }
      },
      onConnected: () => {
        // Wait for 'paired' message from relay
      },
      onDisconnected: () => {
        this.callbacks.onDisconnected?.();
      },
      onError: (err: Error) => {
        this.callbacks.onError?.(err.message);
      },
    });

    this.relay.connect();
  }

  /** Send a command to the remote host */
  sendCommand(command: string): boolean {
    if (!this.relay) return false;
    const msg: RemoteMessage = { type: 'user', message: command };
    return this.relay.send(JSON.stringify({ type: 'data', payload: JSON.stringify(msg) }));
  }

  /** Disconnect */
  disconnect(): void {
    this.relay?.disconnect();
    this.relay = null;
  }
}
