// Clew taste auto-learn: Engine that coordinates pattern detection and suggestions

import { randomUUID } from 'crypto';
import type { TasteRule, TasteRuleKind, TasteRuleSource } from '../core/TasteTypes.js';
import { type DetectedPattern, PatternDetector } from './PatternDetector.js';

// ── Suggestion ────────────────────────────────────────────────────────────────

export type TasteSuggestion = {
  id: string;
  pattern: DetectedPattern;
  /** Whether the user has seen this suggestion */
  seen: boolean;
  /** User response: null = pending, true = accepted, false = rejected */
  resolved: boolean | null;
  /** When the suggestion was created */
  createdAt: string;
};

// ── Auto-Learn Config ─────────────────────────────────────────────────────────

export type AutoLearnConfig = {
  /** Minimum events before first detection */
  minEventsForDetection: number;
  /** Minimum frequency to suggest (overrides PatternDetector default) */
  minFrequencyToSuggest: number;
  /** Don't suggest the same pattern more than once per N ms */
  suggestionCooldownMs: number;
  /** Enable auto-detection on each signal */
  enabled: boolean;
};

export const DEFAULT_AUTO_LEARN_CONFIG: AutoLearnConfig = {
  minEventsForDetection: 5,
  minFrequencyToSuggest: 3,
  suggestionCooldownMs: 30 * 60 * 1000, // 30 min
  enabled: true,
};

// ── Auto-Learn Engine ─────────────────────────────────────────────────────────

export class AutoLearnEngine {
  private detector = new PatternDetector();
  private suggestions: Map<string, TasteSuggestion> = new Map();
  private cooldowns: Map<string, number> = new Map(); // pattern key → timestamp
  private config: AutoLearnConfig;
  private onSuggest?: (suggestion: TasteSuggestion) => void;

  constructor(config?: Partial<AutoLearnConfig>, onSuggest?: (suggestion: TasteSuggestion) => void) {
    this.config = { ...DEFAULT_AUTO_LEARN_CONFIG, ...config };
    this.onSuggest = onSuggest;
  }

  /** Update config at runtime */
  updateConfig(config: Partial<AutoLearnConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /** Process events and return any new suggestions */
  processEvents(events: import('../core/TasteTypes.js').TasteEvent[]): TasteSuggestion[] {
    if (!this.config.enabled || events.length < this.config.minEventsForDetection) {
      return [];
    }

    const patterns = this.detector.detect(events);
    const newSuggestions: TasteSuggestion[] = [];

    for (const pattern of patterns) {
      if (pattern.frequency < this.config.minFrequencyToSuggest) continue;

      const patternKey = `${pattern.kind}:${pattern.text}`;

      // Skip if already suggested
      if (this.suggestions.has(patternKey)) continue;

      // Skip if in cooldown
      const cooldown = this.cooldowns.get(patternKey);
      if (cooldown && Date.now() - cooldown < this.config.suggestionCooldownMs) continue;

      const suggestion: TasteSuggestion = {
        id: randomUUID(),
        pattern,
        seen: false,
        resolved: null,
        createdAt: new Date().toISOString(),
      };

      this.suggestions.set(patternKey, suggestion);
      newSuggestions.push(suggestion);

      if (this.onSuggest) {
        this.onSuggest(suggestion);
      }
    }

    return newSuggestions;
  }

  /** Mark a suggestion as accepted — adds the pattern as a rule */
  acceptSuggestion(
    suggestionId: string,
    addRuleFn: (text: string, kind: TasteRuleKind, source: TasteRuleSource, tags: string[]) => TasteRule,
  ): TasteRule | null {
    const suggestion = this.findSuggestion(suggestionId);
    if (!suggestion) return null;

    suggestion.resolved = true;
    const p = suggestion.pattern;

    const rule = addRuleFn(p.text, p.kind, 'inferred', ['auto-learned']);
    return rule;
  }

  /** Mark a suggestion as rejected */
  rejectSuggestion(suggestionId: string): void {
    const suggestion = this.findSuggestion(suggestionId);
    if (!suggestion) return;

    suggestion.resolved = false;
    // Add to cooldown so we don't suggest again soon
    const key = `${suggestion.pattern.kind}:${suggestion.pattern.text}`;
    this.cooldowns.set(key, Date.now());
  }

  /** Get all pending (unresolved) suggestions */
  getPendingSuggestions(): TasteSuggestion[] {
    return Array.from(this.suggestions.values()).filter(s => s.resolved === null);
  }

  /** Get all suggestions */
  getAllSuggestions(): TasteSuggestion[] {
    return Array.from(this.suggestions.values());
  }

  /** Get suggestion by ID */
  getSuggestion(id: string): TasteSuggestion | undefined {
    return this.getAllSuggestions().find(s => s.id === id);
  }

  private findSuggestion(id: string): TasteSuggestion | undefined {
    // Search by auto-generated ID or by pattern key
    for (const s of this.suggestions.values()) {
      if (s.id === id) return s;
    }
    return undefined;
  }

  /** Reset all state (for testing / re-init) */
  reset(): void {
    this.suggestions.clear();
    this.cooldowns.clear();
  }

  /** Serialize suggestions for persistence */
  serialize(): AutoLearnState {
    return {
      suggestions: Array.from(this.suggestions.entries()),
      cooldowns: Array.from(this.cooldowns.entries()),
    };
  }

  /** Restore from serialized state */
  deserialize(state: AutoLearnState): void {
    this.suggestions = new Map(state.suggestions);
    this.cooldowns = new Map(state.cooldowns);
  }
}

export type AutoLearnState = {
  suggestions: Array<[string, TasteSuggestion]>;
  cooldowns: Array<[string, number]>;
};
