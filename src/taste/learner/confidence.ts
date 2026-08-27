/**
 * Confidence engine and status lifecycle management for Taste rules.
 */

import type { TasteRule, TasteStatus } from '../types.js';

export const THRESHOLDS = {
  IGNORE: 0.3,
  CANDIDATE_MIN: 0.3,
  WEAK_MIN: 0.6,
  ACTIVE_MIN: 0.8,
} as const;

export function deriveStatusFromConfidence(confidence: number, currentStatus?: TasteStatus): TasteStatus {
  if (currentStatus === 'disabled' || currentStatus === 'conflicted') {
    return currentStatus;
  }

  if (confidence >= THRESHOLDS.ACTIVE_MIN) {
    return 'active';
  }
  if (confidence >= THRESHOLDS.WEAK_MIN) {
    return 'weak';
  }
  return 'candidate';
}

export function updateRuleConfidence(
  rule: TasteRule,
  signalWeight: number,
  isPositive: boolean,
): { updatedRule: TasteRule; oldConfidence: number; oldStatus: TasteStatus } {
  const oldConfidence = rule.confidence;
  const oldStatus = rule.status;

  // Dampen changes for explicit user-defined rules
  const effectiveWeight = rule.source === 'explicit' ? signalWeight * 0.2 : signalWeight;
  const newConfidence = Math.max(0.1, Math.min(1.0, oldConfidence + effectiveWeight));

  const newStatus = deriveStatusFromConfidence(newConfidence, rule.status);
  const now = new Date().toISOString();

  const updatedRule: TasteRule = {
    ...rule,
    confidence: Number(newConfidence.toFixed(2)),
    status: newStatus,
    evidenceCount: rule.evidenceCount + 1,
    positiveEvidence: isPositive ? rule.positiveEvidence + 1 : rule.positiveEvidence,
    negativeEvidence: !isPositive ? rule.negativeEvidence + 1 : rule.negativeEvidence,
    updatedAt: now,
    lastObservedAt: now,
  };

  return {
    updatedRule,
    oldConfidence,
    oldStatus,
  };
}
