/**
 * Signal definitions and weight heuristic matrix for Taste evidence.
 */

import type { TasteSignal } from '../types.js';

export const SIGNAL_WEIGHTS: Record<TasteSignal, number> = {
  accept: 0.3,
  reject: -0.4,
  revert: -0.7,
  edit: 0.1, // Base weight for edits; modified by semantic diff analyzer
  test_pass: 0.15,
  test_fail: -0.2,
  build_pass: 0.1,
  build_fail: -0.2,
  lint_pass: 0.05,
  lint_fail: -0.1,
  review_accept: 0.15,
  review_reject: -0.25,
};

export function getSignalWeight(signal: TasteSignal, customWeight?: number): number {
  if (customWeight !== undefined && customWeight !== null) {
    return customWeight;
  }
  return SIGNAL_WEIGHTS[signal] ?? 0.0;
}
