// Clew taste-1: Inject compact taste context block into system prompt

import type { TasteEvent, TasteRule, TasteRuleKind } from '../core/Taste1Types.js';

const KIND_LABELS: Record<TasteRuleKind, string> = {
  style: 'Code style',
  architecture: 'Architecture',
  tooling: 'Tooling',
  testing: 'Testing',
  naming: 'Naming',
  security: 'Security',
  performance: 'Performance',
  ui: 'UI patterns',
  workflow: 'Workflow',
};

/**
 * Builds a compact <clew_taste1> block for system prompt injection.
 * Injects only relevant, high-confidence rules sorted by recency and confidence.
 */
export class TastePromptInjector {
  private maxRules: number;
  private minConfidence: number;

  constructor(maxRules = 8, minConfidence = 0.55) {
    this.maxRules = maxRules;
    this.minConfidence = minConfidence;
  }

  /**
   * Build the taste injection block. Returns null when no rules apply.
   * Block format:
   * <clew_taste1>
   * You are adapting to the user's learned coding taste.
   * Apply these preferences when relevant:
   * 1. [rule text] (kind, confidence)
   * </clew_taste1>
   */
  buildInjection(rules: TasteRule[], _recentEvents?: TasteEvent[]): string | null {
    const qualified = this.filterQualifiedRules(rules);

    if (qualified.length === 0) return null;

    // Sort: by confidence desc, then recency desc
    qualified.sort((a, b) => {
      const confDiff = b.confidence - a.confidence;
      if (Math.abs(confDiff) > 0.05) return confDiff;
      return (b.lastUsedAt ?? b.createdAt).localeCompare(a.lastUsedAt ?? a.createdAt);
    });

    const selected = qualified.slice(0, this.maxRules);
    const lines = selected.map((rule, i) => {
      const kindLabel = KIND_LABELS[rule.kind] ?? rule.kind;
      return `${i + 1}. ${rule.text} (${kindLabel}, confidence: ${(rule.confidence * 100).toFixed(0)}%)`;
    });

    const block = [
      '<clew_taste1>',
      "You are adapting to the user's learned coding taste.",
      'Apply these preferences when relevant:',
      ...lines,
      '</clew_taste1>',
    ].join('\n');

    return block;
  }

  /**
   * Generate a compact constraint block for edit validation.
   */
  buildConstraints(rules: TasteRule[]): string | null {
    const blocking = rules.filter(r => r.confidence >= 0.85);
    if (blocking.length === 0) return null;

    const lines = blocking.map(
      r => `- ${r.text} [${KIND_LABELS[r.kind] ?? r.kind}, confidence ${(r.confidence * 100).toFixed(0)}%]`,
    );

    return [
      '<clew_taste1_constraints>',
      'These learned preferences must not be violated:',
      ...lines,
      '</clew_taste1_constraints>',
    ].join('\n');
  }

  getRelevantRecentEvents(_rules: TasteRule[], events: TasteEvent[]): TasteEvent[] {
    if (events.length === 0) return [];

    // Show recent signals that align with active rules
    const recent = events.slice(-10);
    return recent;
  }

  private filterQualifiedRules(rules: TasteRule[]): TasteRule[] {
    return rules.filter(r => {
      if (r.confidence < this.minConfidence) return false;
      if (r.source === 'inferred' && r.positiveEvidence < 2) return false;
      return true;
    });
  }
}
