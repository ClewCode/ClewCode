import type { StdoutMessage } from 'src/entrypoints/sdk/controlTypes.js';

export interface Transport {
  connect(): Promise<void>;
  close(): void;
  write(message: StdoutMessage): Promise<void>;
  setOnData(callback: (data: string) => void): void;
  setOnClose(callback: (closeCode?: number) => void): void;
  setOnConnect?(callback: () => void): void;
  isConnectedStatus?(): boolean;
  isClosedStatus?(): boolean;
  getStateLabel?(): string;
  getLastSequenceNum?(): number;
  setOnEvent?(callback: (event: unknown) => void): void;
}
