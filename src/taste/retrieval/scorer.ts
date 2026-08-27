/**
 * Taste Rule Scorer — ranks taste rules by relevance, confidence, scope, and recency.
 */

import type { TaskContext, TasteRule } from '../types.js';

export interface ScoredTasteRule {
  rule: TasteRule;
  score: number;
  relevance: number;
}

export function scoreTasteRule(rule: TasteRule, context?: TaskContext): ScoredTasteRule {
  // 1. Relevance calculation
  let relevance = 0.5; // Base relevance

  if (context) {
    const prompt = context.prompt?.toLowerCase() ?? '';
    const ruleText = rule.rule.toLowerCase();

    // Language matching
    if (context.language && rule.scope.language) {
      if (context.language.toLowerCase() === rule.scope.language.toLowerCase()) {
        relevance += 0.3;
      } else {
        // Different language specified: reduce relevance
        relevance -= 0.3;
      }
    }

    // Category matching
    if (context.category && rule.category === context.category) {
      relevance += 0.2;
    }

    // Keyword matching with prompt
    if (prompt) {
      const words = ruleText.split(/\s+/).filter(w => w.length > 3);
      let matchCount = 0;
      for (const w of words) {
        if (prompt.includes(w)) matchCount++;
      }
      if (matchCount > 0) {
        relevance += Math.min(0.4, (matchCount / Math.max(1, words.length)) * 0.5);
      }
    }
  } else {
    relevance = 1.0;
  }

  relevance = Math.max(0.1, Math.min(1.0, relevance));

  // 2. Scope weight (Project > Global)
  const scopeWeight = rule.scope.type === 'project' ? 1.2 : 1.0;

  // 3. Recency factor
  let recency = 1.0;
  if (rule.lastObservedAt) {
    const ageDays = (Date.now() - new Date(rule.lastObservedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays > 90) {
      recency = Math.max(0.7, 1.0 - (ageDays - 90) * 0.002);
    }
  }

  // 4. Source weight (Explicit > Learned)
  const sourceWeight = rule.source === 'explicit' ? 1.1 : 1.0;

  const score = relevance * rule.confidence * scopeWeight * recency * sourceWeight;

  return {
    rule,
    score,
    relevance,
  };
}

export function rankTasteRules(
  rules: TasteRule[],
  context?: TaskContext,
  options?: { maxRules?: number; minConfidence?: number },
): TasteRule[] {
  const minConfidence = options?.minConfidence ?? 0.6;
  const maxRules = options?.maxRules ?? 8;

  const activeRules = rules.filter(r => r.status === 'active' || r.status === 'weak');
  const confidentRules = activeRules.filter(r => r.confidence >= minConfidence);

  const scored = confidentRules.map(r => scoreTasteRule(r, context));

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, maxRules).map(s => s.rule);
}
