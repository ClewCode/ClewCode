/**
 * Guardian Denial Store — in-memory store of recent denials.
 *
 * Used by the `/approve` command to list and override denials.
 * Stores up to 10 most recent denials per session.
 */

import crypto from 'node:crypto';

export type DenialRecord = {
  id: string;
  timestamp: number;
  toolName: string;
  toolInput: string;
  reason: string;
  overridden: boolean;
};

const MAX_DENIALS = 10;
const store: DenialRecord[] = [];

/**
 * Record a new denial.
 */
export function recordDenial(toolName: string, toolInput: string, reason: string): DenialRecord {
  const record: DenialRecord = {
    id: `deny-${crypto.randomUUID().slice(0, 8)}`,
    timestamp: Date.now(),
    toolName,
    toolInput: toolInput.slice(0, 500),
    reason,
    overridden: false,
  };

  store.unshift(record);
  if (store.length > MAX_DENIALS) {
    store.pop();
  }

  return record;
}

/**
 * List recent denials (most recent first).
 */
export function listRecentDenials(): DenialRecord[] {
  return [...store];
}

/**
 * Mark a denial as overridden (approved via /approve).
 * Returns the denial record, or null if not found.
 */
export function markOverridden(id: string): DenialRecord | null {
  const record = store.find(r => r.id === id);
  if (!record) return null;
  record.overridden = true;
  return record;
}

/**
 * Get a single denial by ID.
 */
export function getDenial(id: string): DenialRecord | undefined {
  return store.find(r => r.id === id);
}

/**
 * Clear all stored denials.
 */
export function clearDenials(): void {
  store.length = 0;
}
