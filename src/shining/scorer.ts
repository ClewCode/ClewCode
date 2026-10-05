/**
 * Cheap heuristic scorer.
 */

import type { Premonition } from './types.js';

export function scorePremonition(p: Omit<Premonition, 'id' | 'createdAt'>): number {
  let score = 0.5;
  score += Math.min(0.3, p.evidence.length * 0.1);
  if (p.kind === 'risk') score += 0.05;
  if (p.kind === 'missing_evidence') score += 0.08;
  score = score * 0.6 + p.confidence * 0.4;
  return Math.max(0, Math.min(0.95, score));
}

export function rank(predictions: Premonition[]): Premonition[] {
  return [...predictions].sort((a, b) => b.confidence - a.confidence);
}
