import type { StreamClientEvent } from './SSETransport.js';

/**
 * Transport for session-ingress streaming. Concrete transports (SSE, WS,
 * Hybrid) implement this interface; transportUtils picks one per URL/options.
 */
export interface Transport {
  connect(): Promise<void>;
  isConnectedStatus(): boolean;
  isClosedStatus(): boolean;
  setOnData(callback: (data: string) => void): void;
  setOnClose(callback: (closeCode?: number) => void): void;
  /** Only SSE-based transports deliver parsed client events. */
  setOnEvent?(callback: (event: StreamClientEvent) => void): void;
  close(): void;
}
