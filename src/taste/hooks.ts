/**
 * Taste Auto-Learning Hooks — fire-and-forget, never blocks main flow.
 */

import { collectCorrection, collectExplicitPreference, collectOutcome } from './collector.js';

export function hookUserCorrection(before: string, after: string, filePath?: string): void {
  void collectCorrection({ before, after, filePath }).catch(() => {
    /* best-effort hook */
  });
}

export function hookExplicitPreference(userText: string): void {
  if (!userText || userText.length < 6) return;
  void collectExplicitPreference(userText).catch(() => {
    /* best-effort hook */
  });
}

export function hookOutcome(ruleText: string, success: boolean): void {
  if (!ruleText) return;
  void collectOutcome({ ruleText, success }).catch(() => {
    /* best-effort hook */
  });
}

// Detect if bash command is test/build/lint and succeeded
export function hookBashOutcome(command: string, exitCode: number): void {
  if (exitCode !== 0) return;
  const cmd = command.toLowerCase();
  const isTest = cmd.includes('test') || cmd.includes('jest') || cmd.includes('vitest') || cmd.includes('bun test');
  const isBuild = cmd.includes('build') || cmd.includes('tsc') || cmd.includes('vite build');
  const isLint = cmd.includes('lint') || cmd.includes('biome');
  if (!isTest && !isBuild && !isLint) return;
  // Supporting evidence — find related taste rule if any (e.g., minimal diffs + tests pass)
  // For now use generic outcome that will reinforce recent active rules
  // If no specific rule, we skip (outcome without ruleText is ignored by learner)
}

export function hookAcceptReject(accepted: boolean, ruleText?: string): void {
  if (!ruleText) return;
  void import('./collector.js').then(m =>
    m.collectAcceptReject({ accepted, ruleText }).catch(() => {
      /* best-effort hook */
    }),
  );
}
