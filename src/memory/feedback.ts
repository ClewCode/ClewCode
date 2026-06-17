/**
 * Memory Feedback — handle user feedback signals on memories.
 *
 * Supported signals:
 *   accepted    — confirm memory is correct (boost confidence)
 *   rejected    — memory is incorrect (lower importance + confidence)
 *   corrected   — memory was edited/corrected (boost confidence)
 *   preferred   — coding style preference (write to TASTE.md)
 *   disliked    — negative signal on style/convention (lower importance)
 *   important   — mark memory as highly important (boost importance)
 *   wrong       — memory is factually wrong (sharply lower confidence)
 *
 * All events are recorded in memory_timeline.
 */

import { existsSync } from 'node:fs';
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { getCwd } from '../utils/cwd.js';
import { MemoryDB } from './database.js';
import { getMemoryDirPath, writeMemoryFile } from './hierarchy.js';

export type FeedbackSignal = 'accepted' | 'rejected' | 'corrected' | 'preferred' | 'disliked' | 'important' | 'wrong';

export type FeedbackResult = {
  success: boolean;
  message: string;
  importanceDelta: number;
  confidenceDelta: number;
  wroteToTaste: boolean;
};

const SIGNAL_DELTAS: Record<FeedbackSignal, { importance: number; confidence: number }> = {
  accepted: { importance: 0, confidence: 0.1 },
  rejected: { importance: -0.1, confidence: -0.1 },
  corrected: { importance: 0, confidence: 0.15 },
  preferred: { importance: 0.1, confidence: 0.05 },
  disliked: { importance: -0.1, confidence: -0.05 },
  important: { importance: 0.2, confidence: 0 },
  wrong: { importance: 0, confidence: -0.2 },
};

/** Canonical signal set — only these are stored in memory_timeline. */
const CANONICAL_SIGNALS = new Set<FeedbackSignal>([
  'accepted', 'rejected', 'corrected', 'preferred', 'disliked', 'important', 'wrong',
]);

/** Non-canonical aliases mapped to canonical signal. */
const SIGNAL_ALIASES: Record<string, FeedbackSignal> = {
  correct: 'corrected',
  incorrect: 'wrong',
  like: 'preferred',
  dislike: 'disliked',
};

/**
 * Resolve a signal name to its canonical form.
 * Accepts both canonical names and aliases.
 */
export function resolveSignal(signal: string): FeedbackSignal | null {
  const lower = signal.toLowerCase() as FeedbackSignal;
  if (CANONICAL_SIGNALS.has(lower)) return lower;
  return SIGNAL_ALIASES[lower] ?? null;
}

/**
 * Apply a feedback signal to a memory.
 */
export async function applyFeedback(
  memoryIdOrKey: string,
  signal: FeedbackSignal,
  note?: string,
): Promise<FeedbackResult> {
  const db = MemoryDB.getInstance();

  // Resolve signal alias
  const canonical = resolveSignal(signal);
  if (!canonical) {
    return { success: false, message: `Unknown signal "${signal}"`, importanceDelta: 0, confidenceDelta: 0, wroteToTaste: false };
  }

  // Resolve memory ID from key if needed
  let memory = db.getMemory(memoryIdOrKey);
  if (!memory) {
    memory = db.findByKey(memoryIdOrKey);
  }
  if (!memory) {
    return { success: false, message: `Memory "${memoryIdOrKey}" not found`, importanceDelta: 0, confidenceDelta: 0, wroteToTaste: false };
  }

  const deltas = SIGNAL_DELTAS[canonical];
  if (deltas.importance !== 0) {
    db.updateImportance(memory.id, deltas.importance);
  }
  if (deltas.confidence !== 0) {
    db.updateConfidence(memory.id, deltas.confidence);
  }

  db.logEvent({ memoryId: memory.id, event: signal, note: note ?? '' });

  let wroteToTaste = false;
  if (canonical === 'preferred' && note) {
    await appendToTaste(note);
    wroteToTaste = true;
  }

  return {
    success: true,
    message: `Feedback "${canonical}" applied to "${memoryIdOrKey}"`,
    importanceDelta: deltas.importance,
    confidenceDelta: deltas.confidence,
    wroteToTaste,
  };
}

/**
 * Append a user preference to TASTE.md.
 */
async function appendToTaste(preference: string): Promise<void> {
  const memDir = getMemoryDirPath();
  const tastePath = join(memDir, 'TASTE.md');
  if (!existsSync(tastePath)) {
    await mkdir(memDir, { recursive: true });
    await writeMemoryFile('TASTE.md', '# Coding Style & Preferences\n\n');
  }
  const timestamp = new Date().toISOString().slice(0, 10);
  await appendFile(tastePath, `\n- [${timestamp}] ${preference}`, 'utf8');
}

/**
 * Apply feedback by memory key (convenience wrapper).
 */
export async function applyFeedbackByKey(
  key: string,
  signal: FeedbackSignal,
  note?: string,
): Promise<FeedbackResult> {
  const db = MemoryDB.getInstance();
  const memory = db.findByKey(key);
  if (!memory) {
    return { success: false, message: `Memory with key "${key}" not found`, importanceDelta: 0, confidenceDelta: 0, wroteToTaste: false };
  }
  return applyFeedback(memory.id, signal, note);
}
