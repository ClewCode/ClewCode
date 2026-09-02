/**
 * Repeated Correction Aggregator — cross-session, time-windowed
 *
 * Counts behavioral evidence within sliding window (7 days) to promote.
 * Creative: also detects bursts (3 corrections in 7 days = strong taste)
 */

import type { TasteEvidence } from './types.js';

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const WEAK_THRESHOLD = 2;
const ACTIVE_THRESHOLD = 3;

export function countRecent(evidence: TasteEvidence[], now = Date.now()): number {
  return evidence.filter(e => now - new Date(e.timestamp).getTime() < WINDOW_MS).length;
}

export function shouldPromoteToWeak(recentCount: number, currentStatus: string): boolean {
  return currentStatus === 'candidate' && recentCount >= WEAK_THRESHOLD;
}
export function shouldPromoteToActive(recentCount: number, currentStatus: string, hasConflict: boolean): boolean {
  if (hasConflict) return false;
  return (currentStatus === 'weak' || currentStatus === 'candidate') && recentCount >= ACTIVE_THRESHOLD;
}

export function decayConfidence(confidence: number, lastObservedAt: string): number {
  const ageDays = (Date.now() - new Date(lastObservedAt).getTime()) / (24 * 60 * 60 * 1000);
  if (ageDays < 30) return confidence;
  // decay 0.02 per 30 days after 30, floor 0.3
  const decay = Math.floor((ageDays - 30) / 30) * 0.02;
  return Math.max(0.3, confidence - decay);
}
