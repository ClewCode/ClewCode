/**
 * Evidence Collector for recording Taste signals into storage.
 */

import type { TasteEvidence, TasteSignal, TasteStore } from '../types.js';
import { sanitizeEvidenceText } from './sanitizer.js';
import { getSignalWeight } from './signals.js';

export interface RecordEvidenceOptions {
  taskId: string;
  ruleId?: string;
  signal: TasteSignal;
  customWeight?: number;
  before?: string;
  after?: string;
  filePath?: string;
  details?: string;
}

export class EvidenceCollector {
  private store: TasteStore;

  constructor(store: TasteStore) {
    this.store = store;
  }

  async record(options: RecordEvidenceOptions): Promise<TasteEvidence> {
    const weight = getSignalWeight(options.signal, options.customWeight);
    const now = new Date().toISOString();
    const id = `ev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const evidence: TasteEvidence = {
      id,
      taskId: options.taskId,
      ruleId: options.ruleId,
      signal: options.signal,
      weight,
      before: sanitizeEvidenceText(options.before),
      after: sanitizeEvidenceText(options.after),
      filePath: options.filePath,
      details: sanitizeEvidenceText(options.details),
      timestamp: now,
    };

    await this.store.addEvidence(evidence);
    return evidence;
  }
}
