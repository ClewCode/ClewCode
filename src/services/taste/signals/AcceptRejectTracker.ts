// Clew taste: Track accept/reject signals from user interactions

import type { TasteEvent, TasteSignalType } from '../core/TasteTypes.js';

export type AcceptRejectSignal = {
  type: 'accept' | 'reject';
  timestamp: string;
  prompt?: string;
  filePaths?: string[];
  model?: string;
  provider?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Tracks user accept/reject events.
 * In the current codebase, accept/reject signals come from:
 * - Tool execution approval/denial
 * - Edit accept/revert
 * - Permission dialog outcomes
 * These are integrated via the hook system.
 */
export class AcceptRejectTracker {
  private lastSignals: AcceptRejectSignal[] = [];
  private maxHistory = 100;

  record(signal: AcceptRejectSignal): void {
    this.lastSignals.push(signal);
    if (this.lastSignals.length > this.maxHistory) {
      this.lastSignals.shift();
    }
  }

  getRecent(count = 10): AcceptRejectSignal[] {
    return this.lastSignals.slice(-count);
  }

  getAcceptRate(sinceMs?: number): number {
    const signals = sinceMs
      ? this.lastSignals.filter(s => Date.parse(s.timestamp) > Date.now() - sinceMs)
      : this.lastSignals;

    if (signals.length === 0) return 0.5;
    const accepts = signals.filter(s => s.type === 'accept').length;
    return accepts / signals.length;
  }

  toEvents(): TasteEvent[] {
    return this.lastSignals.map(s => ({
      id: crypto.randomUUID(),
      type: s.type as TasteSignalType,
      timestamp: s.timestamp,
      prompt: s.prompt,
      filePaths: s.filePaths,
      model: s.model,
      provider: s.provider,
      reward: s.type === 'accept' ? 1.0 : -1.0,
      metadata: s.metadata,
    }));
  }

  clear(): void {
    this.lastSignals = [];
  }
}
