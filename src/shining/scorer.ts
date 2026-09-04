/**
 * Cheap heuristic scorer.
 */

import type { TasteRule } from '../taste/types.js';
import type { Premonition } from './types.js';

export function scorePremonition(p: Omit<Premonition, 'id' | 'createdAt'>, tasteRules: TasteRule[] = []): number {
  let score = 0.5;
  score += Math.min(0.3, p.evidence.length * 0.1);
  if (p.kind === 'risk') score += 0.05;
  if (p.kind === 'missing_evidence') score += 0.08;
  // Taste prior: boost if premonition aligns with active taste
  if (tasteRules.length > 0) {
    const text = `${p.prediction} ${p.suggestedContext?.join(' ') ?? ''}`.toLowerCase();
    for (const r of tasteRules.filter(r => r.status === 'active')) {
      const rule = r.rule.toLowerCase();
      const keywords = rule
        .split(/\s+/)
        .filter(w => w.length > 3)
        .slice(0, 4);
      const matches = keywords.filter(k => text.includes(k)).length;
      if (matches >= 2) score += 0.12;
      else if (matches === 1) score += 0.06;
      // e.g., taste "test-first" → missing_evidence: tests gets boost
      if (r.category === 'testing' && p.kind === 'missing_evidence') score += 0.07;
      if (r.category === 'workflow' && p.kind === 'next_intent') score += 0.05;
    }
  }
  score = score * 0.6 + p.confidence * 0.4;
  return Math.max(0, Math.min(0.95, score));
}

export function rank(predictions: Premonition[]): Premonition[] {
  return [...predictions].sort((a, b) => b.confidence - a.confidence);
}
