/**
 * ACP Status Manager — Singleton for tracking ACP server state.
 *
 * Components subscribe via `changed` signal instead of polling.
 * ACPServer calls `update()` on lifecycle events.
 */

import { createSignal } from '../../utils/signal.js';

export type ACPStatus = {
  isRunning: boolean;
  activeSessions: number;
  transport: 'stdio' | 'websocket' | null;
  port: number | null;
};

const INITIAL_STATUS: ACPStatus = {
  isRunning: false,
  activeSessions: 0,
  transport: null,
  port: null,
};

export class ACPStatusManager {
  private static instance: ACPStatusManager | null = null;
  private status: ACPStatus = { ...INITIAL_STATUS };
  readonly changed = createSignal<[status: ACPStatus]>();

  static getInstance(): ACPStatusManager {
    if (!ACPStatusManager.instance) {
      ACPStatusManager.instance = new ACPStatusManager();
    }
    return ACPStatusManager.instance;
  }

  getStatus(): ACPStatus {
    return { ...this.status };
  }

  update(partial: Partial<ACPStatus>): void {
    this.status = { ...this.status, ...partial };
    this.changed.emit(this.getStatus());
  }

  incrementSessions(): void {
    this.status.activeSessions++;
    this.changed.emit(this.getStatus());
  }

  decrementSessions(): void {
    if (this.status.activeSessions > 0) {
      this.status.activeSessions--;
    }
    this.changed.emit(this.getStatus());
  }

  reset(): void {
    this.status = { ...INITIAL_STATUS };
    this.changed.emit(this.getStatus());
  }

  /** For testing */
  static resetInstance(): void {
    if (ACPStatusManager.instance) {
      ACPStatusManager.instance.changed.clear();
      ACPStatusManager.instance = null;
    }
  }
}
