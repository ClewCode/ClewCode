/**
 * Taste Signal — 3-level sensor for Taste auto-learning.
 *
 * explicit  (1.0) — "ต่อไปอย่าเขียน comment เยอะ", "/taste add", user says preference directly
 * behavioral (0.6) — user edits output in same direction repeatedly, accept/reject, correction
 * outcome    (0.2) — supporting only (tests pass reinforces, never creates)
 */

export type SignalKind = 'explicit' | 'behavioral' | 'outcome';

export type TasteSignalInput = {
  kind: SignalKind;
  taskId: string;
  ruleText?: string; // for explicit: the preference text
  category?: string;
  before?: string;
  after?: string;
  filePath?: string;
  details?: string;
  // for accept/reject
  accepted?: boolean;
};

export const SIGNAL_WEIGHT: Record<SignalKind, number> = {
  explicit: 1.0,
  behavioral: 0.6,
  outcome: 0.2,
};

export function weightFor(kind: SignalKind): number {
  return SIGNAL_WEIGHT[kind];
}
