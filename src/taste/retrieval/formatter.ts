/**
 * Context format generator for Taste rules.
 * Generates clean, compact <clew_taste> prompt sections without leaking database internals.
 */

import type { TasteRule } from '../types.js';

export interface FormatterOptions {
  maxRules?: number;
  maxChars?: number;
}

export function formatTasteContext(rules: TasteRule[], options?: FormatterOptions): string | null {
  if (!rules || rules.length === 0) return null;

  const maxRules = options?.maxRules ?? 8;
  const maxChars = options?.maxChars ?? 2000;

  const selected = rules.slice(0, maxRules);
  const lines: string[] = [];

  for (let i = 0; i < selected.length; i++) {
    const item = selected[i]!;
    const ruleLine = `${i + 1}. ${item.rule.trim()}`;
    lines.push(ruleLine);
  }

  const content = lines.join('\n');
  const formatted = `<clew_taste>\nRelevant preferences:\n\n${content}\n</clew_taste>`;

  if (formatted.length > maxChars) {
    return formatted.slice(0, maxChars) + '\n...</clew_taste>';
  }

  return formatted;
}
