// Clew taste-1: Compile high-confidence rules into symbolic constraints

import type { TasteRule } from './Taste1Types.js';

export type ConstraintResult = {
  passed: boolean;
  blocked: boolean;
  ruleId: string;
  ruleText: string;
  confidence: number;
  reason: string;
};

export type CompilationResult = {
  constraints: ConstraintResult[];
  blocked: boolean;
  summary: string;
};

const META_WORDS = new Set([
  'use',
  'uses',
  'using',
  'prefer',
  'prefers',
  'preferring',
  'always',
  'never',
  'avoid',
  'avoids',
  'avoiding',
  'dont',
  'should',
  'must',
  'keep',
  'try',
  'need',
  'make',
  'ensure',
  'consider',
  'add',
  'not',
  'but',
  'when',
  'where',
  'than',
  'then',
  'with',
  'without',
]);

const NEGATION_INDICATORS = ['never', 'avoid', 'dont', 'without', 'no '];

/**
 * Symbolic engine: evaluates candidate output against active rules.
 * Rules with confidence >= blockThreshold can warn or block edit acceptance.
 * Rules below minConfidence are ignored.
 */
export class Taste1SymbolicEngine {
  private minConfidence: number;
  private blockThreshold: number;

  constructor(minConfidence = 0.55, blockThreshold = 0.85) {
    this.minConfidence = minConfidence;
    this.blockThreshold = blockThreshold;
  }

  setThresholds(minConfidence: number, blockThreshold: number): void {
    this.minConfidence = minConfidence;
    this.blockThreshold = blockThreshold;
  }

  /**
   * Evaluate output text against a set of rules.
   * Returns constraint results with pass/fail for each applicable rule.
   */
  evaluate(output: string, rules: TasteRule[]): CompilationResult {
    const applicable = rules.filter(r => r.confidence >= this.minConfidence);
    const constraints: ConstraintResult[] = [];
    let anyBlocked = false;

    for (const rule of applicable) {
      const result = this.evaluateSingle(output, rule);
      constraints.push(result);
      if (result.blocked && !result.passed) {
        anyBlocked = true;
      }
    }

    const summary = this.formatSummary(constraints);
    return { constraints, blocked: anyBlocked, summary };
  }

  private evaluateSingle(output: string, rule: TasteRule): ConstraintResult {
    const outputLower = output.toLowerCase();
    const ruleLower = rule.text.toLowerCase();
    const keywords = this.extractKeywords(ruleLower);
    const isNegative = NEGATION_INDICATORS.some(w => ruleLower.startsWith(w));

    if (keywords.length === 0) {
      return {
        passed: true,
        blocked: false,
        ruleId: rule.id,
        ruleText: rule.text,
        confidence: rule.confidence,
        reason: 'No enforceable keywords in rule',
      };
    }

    // For negative rules (never/avoid), keyword presence in output = violation.
    // For positive rules (use/prefer), keyword absence from output = violation.
    const violations = keywords.filter(kw => {
      if (isNegative) {
        return outputLower.includes(kw); // found forbidden keyword → violation
      }
      return !outputLower.includes(kw); // missing required keyword → violation
    });

    if (violations.length === 0) {
      return {
        passed: true,
        blocked: false,
        ruleId: rule.id,
        ruleText: rule.text,
        confidence: rule.confidence,
        reason: 'Output conforms to rule',
      };
    }

    const isBlocking = rule.confidence >= this.blockThreshold;
    return {
      passed: !isBlocking,
      blocked: isBlocking,
      ruleId: rule.id,
      ruleText: rule.text,
      confidence: rule.confidence,
      reason: isBlocking
        ? `Blocked by rule "${rule.text}" (confidence: ${rule.confidence.toFixed(2)})`
        : `Warning: rule "${rule.text}" suggests different approach`,
    };
  }

  private extractKeywords(text: string): string[] {
    const tokens = text
      .toLowerCase()
      .replace(/[^a-z0-9_!\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2 && !META_WORDS.has(t));

    // Deduplicate
    return [...new Set(tokens)];
  }

  private formatSummary(constraints: ConstraintResult[]): string {
    const passed = constraints.filter(c => c.passed).length;
    const failed = constraints.filter(c => !c.passed).length;
    const blocked = constraints.filter(c => c.blocked && !c.passed).length;

    const parts: string[] = [];
    if (blocked > 0) parts.push(`${blocked} blocked`);
    if (failed > 0) parts.push(`${failed} warnings`);

    if (parts.length === 0) return 'All constraints passed';
    return `Constraints: ${parts.join(', ')} (${passed} passed, ${constraints.length} total)`;
  }
}
