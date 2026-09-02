/**
 * Signal Collector — 4 hooks for Taste auto-learning.
 *
 * 1. User correction/edit       → behavioral (0.6)
 * 2. Explicit preference language → explicit (1.0)
 * 3. Accept/reject              → behavioral (0.6)
 * 4. Execution outcome          → outcome (0.2) supporting only
 */

import { categorizePreference, detectExplicitPreference } from './detector.js';
import { learnFromSignal } from './learner.js';
import type { TasteCategory } from './types.js';

function taskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

// 1. User correction/edit — strongest behavioral
export async function collectCorrection(opts: { before: string; after: string; filePath?: string; details?: string }) {
  const ruleText = inferRuleFromEdit(opts.before, opts.after);
  if (!ruleText) return null;
  return learnFromSignal({
    kind: 'behavioral',
    ruleText,
    taskId: taskId(),
    category: 'coding' as TasteCategory,
    details: opts.details || `edit: ${opts.filePath || 'unknown'}`,
  });
}

function inferRuleFromEdit(before: string, after: string): string | null {
  const b = before.length;
  const a = after.length;
  const bLines = before.split('\n');
  const aLines = after.split('\n');
  const bComments = (before.match(/\/\/|\/\*|#/g) || []).length;
  const aComments = (after.match(/\/\/|\/\*|#/g) || []).length;

  // 1. Comment pruning — creative: user strips comments repeatedly
  if (bComments > aComments + 3 && bComments > 5) return 'Avoid excessive comments, code should be self-explanatory';
  // 2. Any → precise type
  if (before.includes(': any') && !after.includes(': any') && after.includes(':'))
    return 'Prefer precise TypeScript types over any';
  // 3. Broad refactor → minimal diff
  if (b > a * 1.5 && b > 200) return 'Prefer minimal focused diffs over broad refactors';
  if (bLines.length > aLines.length + 10) return 'Prefer concise implementations without unnecessary abstractions';
  // 4. Abstraction before → concrete after
  if (before.includes('abstract') || before.includes('factory') || before.includes('createHelper')) {
    if (!after.includes('abstract') && !after.includes('factory')) return "Don't add premature abstractions";
  }
  // 5. Defensive error handling removed
  if (before.includes('try') && before.includes('catch') && !after.includes('try'))
    return "Don't add defensive error handling for impossible cases";
  // 6. Bun-native vs Node
  if (before.includes('node:') && after.includes('bun:'))
    return 'Prefer Bun-native APIs over Node compatibility layers';
  // 7. Composition vs inheritance
  if (before.includes('extends') && after.includes('composition')) return 'Prefer composition over inheritance';
  if (after.includes('composition') && before.includes('inheritance')) return 'Prefer composition over inheritance';
  // 8. Response length
  if (a < 500 && b > 1000) return 'Keep responses concise and code-first';
  // 9. Verbose → concise naming
  if (bLines.some(l => l.length > 120) && aLines.every(l => l.length <= 100)) return 'Keep code and responses concise';
  return null;
}

// 2. Explicit preference language
export async function collectExplicitPreference(text: string) {
  const detected = detectExplicitPreference(text);
  if (!detected) return null;
  const category = categorizePreference(detected) as TasteCategory;
  return learnFromSignal({
    kind: 'explicit',
    ruleText: detected,
    taskId: taskId(),
    category,
    details: `explicit: "${text.slice(0, 100)}"`,
  });
}

// 3. Accept/reject
export async function collectAcceptReject(opts: { accepted: boolean; ruleText?: string; details?: string }) {
  if (opts.accepted) {
    // Accept reinforces if ruleText known, otherwise behavioral generic
    if (!opts.ruleText) return null;
    return learnFromSignal({
      kind: 'behavioral',
      ruleText: opts.ruleText,
      taskId: taskId(),
      details: opts.details || 'accepted proposal',
    });
  } else {
    // Reject → could be negative evidence, for now create/ reinforce opposite
    if (!opts.ruleText) return null;
    return learnFromSignal({
      kind: 'behavioral',
      ruleText: opts.ruleText,
      taskId: taskId(),
      details: opts.details || 'rejected proposal',
    });
  }
}

// 4. Execution outcome — supporting only (never creates)
export async function collectOutcome(opts: { ruleText: string; success: boolean; taskId?: string }) {
  return learnFromSignal({
    kind: 'outcome',
    ruleText: opts.ruleText,
    taskId: opts.taskId || taskId(),
    details: opts.success ? 'outcome: tests pass (supporting)' : 'outcome: tests fail',
  });
}

// Generic entry for manual signals
export async function collectSignal(opts: {
  kind: 'explicit' | 'behavioral' | 'outcome';
  ruleText: string;
  category?: TasteCategory;
  details?: string;
}) {
  return learnFromSignal({
    kind: opts.kind,
    ruleText: opts.ruleText,
    taskId: taskId(),
    category: opts.category as TasteCategory,
    details: opts.details,
  });
}
