// Clew taste auto-learn: Pattern detection from events

import type { TasteEvent, TasteRule, TasteRuleKind } from '../core/TasteTypes.js';

// ── Detected Pattern ──────────────────────────────────────────────────────────

export type DetectedPattern = {
  /** Suggested rule text */
  text: string;
  /** Rule kind */
  kind: TasteRuleKind;
  /** How many times this pattern was observed */
  frequency: number;
  /** Confidence 0-1 based on frequency + consistency */
  confidence: number;
  /** Which signals contributed */
  evidence: Array<{ eventId: string; text: string }>;
};

// ── Keyword-based Heuristics ──────────────────────────────────────────────────

type KeywordPattern = {
  keywords: string[];
  kind: TasteRuleKind;
  buildRule: (match: string) => string;
};

const KEYWORD_PATTERNS: KeywordPattern[] = [
  {
    keywords: ['const', 'let', 'var', 'arrow function', 'function declaration'],
    kind: 'style',
    buildRule: m => `Use ${m.toLowerCase()} for variable/function declarations`,
  },
  {
    keywords: ['indent', 'tab', 'space', 'semicolon', 'quote', 'bracket'],
    kind: 'style',
    buildRule: m => `Use ${m.toLowerCase()} for code formatting`,
  },
  {
    keywords: ['error handling', 'try', 'catch', 'error', 'validate'],
    kind: 'security',
    buildRule: m => `Always add ${m.toLowerCase()} when appropriate`,
  },
  {
    keywords: ['test', 'spec', 'unit test', 'integration test'],
    kind: 'testing',
    buildRule: m => `Write ${m.toLowerCase()} for new code`,
  },
  {
    keywords: ['type', 'interface', 'type annotation', 'typescript'],
    kind: 'style',
    buildRule: m => `Use ${m.toLowerCase()} for type safety`,
  },
  {
    keywords: ['async', 'await', 'promise', 'callback'],
    kind: 'performance',
    buildRule: m => `Use ${m.toLowerCase()} for asynchronous code`,
  },
  {
    keywords: ['memo', 'callback', 'effect', 'react', 'hook'],
    kind: 'architecture',
    buildRule: m => `Follow React ${m.toLowerCase()} best practices`,
  },
  {
    keywords: ['api', 'route', 'endpoint', 'rest', 'graphql'],
    kind: 'architecture',
    buildRule: m => `Follow ${m.toLowerCase()} conventions`,
  },
  {
    keywords: ['css', 'tailwind', 'styled', 'module.css', 'scss'],
    kind: 'ui',
    buildRule: m => `Use ${m.toLowerCase()} for styling`,
  },
  {
    keywords: ['naming', 'name', 'PascalCase', 'camelCase', 'snake_case'],
    kind: 'naming',
    buildRule: m => `Use ${m.toLowerCase()} naming convention`,
  },
  {
    keywords: ['config', 'env', 'setting', 'constant'],
    kind: 'architecture',
    buildRule: m => `Use ${m.toLowerCase()} for configuration`,
  },
  {
    keywords: ['logger', 'log', 'debug', 'console'],
    kind: 'tooling',
    buildRule: m => `Use ${m.toLowerCase()} for debugging`,
  },
];

// ── Pattern Detector ──────────────────────────────────────────────────────────

export class PatternDetector {
  private minFrequency = 2;
  private maxPatterns = 20;

  /**
   * Analyze events and return detected patterns.
   * Only returns patterns observed at least minFrequency times
   * with a minimum confidence threshold.
   */
  detect(events: TasteEvent[]): DetectedPattern[] {
    const patterns = new Map<string, DetectedPattern>();

    for (const event of events) {
      this.detectFromPrompt(event, patterns);
      this.detectFromDiff(event, patterns);
    }

    // Filter: only return patterns with enough evidence
    return Array.from(patterns.values())
      .filter(p => p.frequency >= this.minFrequency)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, this.maxPatterns);
  }

  private detectFromPrompt(event: TasteEvent, patterns: Map<string, DetectedPattern>): void {
    const text = event.prompt || '';
    if (!text) return;

    const lower = text.toLowerCase();

    for (const pattern of KEYWORD_PATTERNS) {
      const matchedKeyword = pattern.keywords.find(kw => lower.includes(kw.toLowerCase()));
      if (!matchedKeyword) continue;

      const ruleText = pattern.buildRule(matchedKeyword);
      const key = `${pattern.kind}:${ruleText}`;

      if (!patterns.has(key)) {
        patterns.set(key, {
          text: ruleText,
          kind: pattern.kind,
          frequency: 0,
          confidence: 0,
          evidence: [],
        });
      }

      const p = patterns.get(key)!;
      p.frequency++;

      // Only record first few evidence entries
      if (p.evidence.length < 5) {
        // Extract a snippet around the match
        const idx = lower.indexOf(matchedKeyword.toLowerCase());
        const snippetStart = Math.max(0, idx - 30);
        const snippetEnd = Math.min(text.length, idx + matchedKeyword.length + 30);
        const snippet =
          (snippetStart > 0 ? '...' : '') +
          text.slice(snippetStart, snippetEnd).trim() +
          (snippetEnd < text.length ? '...' : '');
        p.evidence.push({ eventId: event.id, text: snippet });
      }

      // Confidence: increases with frequency, max 0.95
      p.confidence = Math.min(0.95, 0.3 + p.frequency * 0.15);

      // Higher confidence for accept events
      if (event.type === 'accept') {
        p.confidence = Math.min(0.95, p.confidence + 0.1);
      }
    }
  }

  private detectFromDiff(event: TasteEvent, patterns: Map<string, DetectedPattern>): void {
    const before = event.before || '';
    const after = event.after || '';
    const diff = event.diff || '';
    if (!before && !after && !diff) return;

    const combined = `${before}\n${after}\n${diff}`.toLowerCase();

    // Detect var → let/const preference
    if (
      (combined.includes('var ') || combined.includes('var\t')) &&
      (combined.includes('let ') || combined.includes('const '))
    ) {
      const key = 'style:Use const/let instead of var';
      if (!patterns.has(key)) {
        patterns.set(key, {
          text: 'Use const/let instead of var',
          kind: 'style',
          frequency: 0,
          confidence: 0,
          evidence: [],
        });
      }
      const p = patterns.get(key)!;
      p.frequency++;
      p.confidence = Math.min(0.95, 0.3 + p.frequency * 0.15);
    }

    // Detect function → arrow function
    if (combined.includes('function(') || combined.includes('function (')) {
      const key = 'style:Prefer arrow functions over function declarations';
      if (!patterns.has(key)) {
        patterns.set(key, {
          text: 'Prefer arrow functions over function declarations',
          kind: 'style',
          frequency: 0,
          confidence: 0,
          evidence: [],
        });
      }
      const p = patterns.get(key)!;
      p.frequency++;
      p.confidence = Math.min(0.95, 0.3 + p.frequency * 0.15);
    }

    // Detect error handling additions
    if (
      (combined.includes('try') || combined.includes('catch')) &&
      (combined.includes('error') || combined.includes('err'))
    ) {
      const key = 'security:Add error handling for operations that may fail';
      if (!patterns.has(key)) {
        patterns.set(key, {
          text: 'Add error handling for operations that may fail',
          kind: 'security',
          frequency: 0,
          confidence: 0,
          evidence: [],
        });
      }
      const p = patterns.get(key)!;
      p.frequency++;
      p.confidence = Math.min(0.95, 0.3 + p.frequency * 0.15);
    }
  }
}
