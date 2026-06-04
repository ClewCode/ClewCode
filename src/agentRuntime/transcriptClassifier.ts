/**
 * Transcript / task-complexity classifier.
 *
 * Given a user prompt (and optional recent transcript context), this
 * module scores how "complex" the task is. A high score is a signal
 * that `ultracode` (a parallel dynamic workflow) would help; the
 * `shouldSuggestUltracode` flag is the integration point the host
 * uses to either auto-enable ultracode or show a one-line hint.
 *
 * The classifier is purely heuristic so it can run on every prompt
 * without spending tokens. A future LLM-based classifier can replace
 * or augment this — the shape of the output is stable.
 *
 * Heuristic inputs:
 *  1. Prompt length and verb density (more verbs → more action).
 *  2. Explicit complexity keywords (audit, migrate, refactor across,
 *     end-to-end, every file, etc.). Mirrors the keywords used by
 *     `shouldUseDynamicWorkflow` so the two stay consistent.
 *  3. File/system scope words (every, all, codebase, repo-wide, end-
 *     to-end, across all files).
 *  4. Transcript context: how many prior turns the conversation has
 *     gone through and how many tools have been invoked. Long
 *     transcripts with tool churn are more likely to need a fresh,
 *     structured approach.
 *
 * Score range: 0.0 (trivial) → 1.0 (very complex). Suggestion kicks
 * in at >= 0.55.
 */

export type ComplexityRecommendation = 'simple' | 'moderate' | 'complex';

export type TranscriptContext = {
  /** Number of prior user/assistant turns in the current session. */
  priorTurns?: number;
  /** Number of distinct tool invocations in the prior transcript. */
  toolCallCount?: number;
  /** When true, the most recent turn ended with a tool error. */
  lastTurnErrored?: boolean;
  /**
   * Fractional progress of the active `/goal` (0.0–1.0). 0 means no
   * goal is active; 1 means a budget is fully consumed. The classifier
   * boosts complexity when a goal is past 0.7 — a stuck goal usually
   * means the user is wrestling with the codebase, not making
   * progress, so a parallel workflow can break the loop.
   */
  goalProgress?: number;
  /** True when the active goal is currently paused. */
  goalPaused?: boolean;
};

export type ClassifierResult = {
  score: number;
  recommendation: ComplexityRecommendation;
  /** Short, human-readable rationale — surfaces in the suggestion message. */
  reasoning: string;
  /** Convenience: derived from score and thresholds. */
  shouldSuggestUltracode: boolean;
  /** Matched keyword + scope flags, useful for telemetry / debugging. */
  signals: {
    lengthScore: number;
    verbDensity: number;
    keywordHits: string[];
    scopeHits: string[];
    contextBoost: number;
  };
};

const SUGGEST_THRESHOLD = 0.55;
const STRONG_THRESHOLD = 0.65;

const COMPLEXITY_KEYWORDS = [
  'audit',
  'migrate',
  'migration',
  'rewrite',
  'port',
  'refactor across',
  'find all',
  'find every',
  'hunt',
  'stress test',
  'stress-test',
  'harden',
  'security review',
  'security audit',
  'profiler',
  'profile',
  'end-to-end',
  'every file',
  'all files',
  'across all files',
  'every service',
  'codebase-wide',
  'repo-wide',
  'moderniz',
  'plan and implement',
  'multi-step',
  'spanning',
];

const SCOPE_KEYWORDS = [
  'every',
  'all',
  'codebase',
  'repo',
  'repository',
  'end-to-end',
  'cross-cutting',
  'cross-service',
  'across the',
  'every service',
  'every file',
  'all files',
  'codebase-wide',
  'repo-wide',
];

const ACTION_VERBS = [
  'fix',
  'implement',
  'migrate',
  'update',
  'change',
  'replace',
  'add',
  'remove',
  'rewrite',
  'port',
  'find',
  'scan',
  'check',
  'verify',
  'test',
  'refactor',
  'document',
  'review',
  'audit',
  'rewrite',
  'restructure',
  'decompose',
  'split',
  'merge',
  'consolidate',
];

export function classifyTranscript(params: {
  prompt: string;
  context?: TranscriptContext;
}): ClassifierResult {
  const prompt = (params.prompt || '').trim();
  const lowered = prompt.toLowerCase();
  const context = params.context ?? {};

  // 1. Length score: ramps from 0 at 0 chars to 1 at 800 chars.
  const lengthScore = clamp01(prompt.length / 800);

  // 2. Verb density: number of action verbs / 100 chars. Each verb
  //    above a baseline (1 per 80 chars) bumps the score.
  const verbHits = ACTION_VERBS.filter(v => containsWord(lowered, v));
  const verbDensity = clamp01((verbHits.length / Math.max(1, prompt.length / 80)) * 0.5);

  // 3. Keyword hits (complexity-flavoured phrases).
  const keywordHits = COMPLEXITY_KEYWORDS.filter(kw => lowered.includes(kw));

  // 4. Scope hits (broad-coverage words).
  const scopeHits = SCOPE_KEYWORDS.filter(kw => containsWord(lowered, kw));

  // 5. Context boost: long, tool-heavy transcripts that have been
  //    struggling get a small bump.
  let contextBoost = 0;
  if (context.priorTurns !== undefined) {
    if (context.priorTurns >= 30) contextBoost += 0.2;
    else if (context.priorTurns >= 15) contextBoost += 0.1;
  }
  if (context.toolCallCount !== undefined) {
    if (context.toolCallCount >= 60) contextBoost += 0.2;
    else if (context.toolCallCount >= 25) contextBoost += 0.1;
  }
  if (context.lastTurnErrored) contextBoost += 0.15;
  if (context.goalPaused) contextBoost += 0.1;
  if (context.goalProgress !== undefined) {
    if (context.goalProgress >= 0.9) contextBoost += 0.2;
    else if (context.goalProgress >= 0.7) contextBoost += 0.1;
  }
  contextBoost = clamp01(contextBoost);

  // Weighted sum. Keyword hits dominate; scope hits reinforce; verb
  // density and length are baseline signals.
  const raw =
    0.15 * lengthScore +
    0.15 * verbDensity +
    0.5 * (keywordHits.length > 0 ? Math.min(1, 0.4 + keywordHits.length * 0.45) : 0) +
    0.1 * (scopeHits.length > 0 ? Math.min(1, 0.3 + scopeHits.length * 0.3) : 0) +
    0.1 * contextBoost;

  const score = round3(clamp01(raw));
  const recommendation: ComplexityRecommendation =
    score >= STRONG_THRESHOLD ? 'complex' : score >= SUGGEST_THRESHOLD ? 'moderate' : 'simple';

  const reasoning = buildReasoning({
    lengthScore,
    verbDensity,
    keywordHits,
    scopeHits,
    contextBoost,
    recommendation,
  });

  return {
    score,
    recommendation,
    reasoning,
    shouldSuggestUltracode: score >= SUGGEST_THRESHOLD,
    signals: {
      lengthScore: round3(lengthScore),
      verbDensity: round3(verbDensity),
      keywordHits,
      scopeHits,
      contextBoost: round3(contextBoost),
    },
  };
}

/**
 * Convenience: returns the suggestion text the host can show to the
 * user. The host decides whether to print, prompt for confirmation,
 * or auto-enable. Returns `null` when no suggestion is warranted so
 * callers can check truthiness.
 */
export function buildUltracodeSuggestion(result: ClassifierResult): string | null {
  if (!result.shouldSuggestUltracode) return null;
  const cmd = result.recommendation === 'complex'
    ? `/effort ultracode`
    : `/ultracode on`;
  return `◈ ultracode · this task looks ${result.recommendation} (score ${result.score}). ` +
    `Run \`${cmd}\` to let Claude auto-decompose it into a parallel dynamic workflow. ` +
    `${result.reasoning}`;
}

function containsWord(haystack: string, word: string): boolean {
  const re = new RegExp(`\\b${escapeRegex(word)}\\b`, 'i');
  return re.test(haystack);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function buildReasoning(s: {
  lengthScore: number;
  verbDensity: number;
  keywordHits: string[];
  scopeHits: string[];
  contextBoost: number;
  recommendation: ComplexityRecommendation;
}): string {
  const parts: string[] = [];
  if (s.keywordHits.length > 0) {
    parts.push(`matched: ${s.keywordHits.slice(0, 3).join(', ')}`);
  }
  if (s.scopeHits.length > 0 && parts.length < 3) {
    parts.push(`broad scope: ${s.scopeHits.slice(0, 3).join(', ')}`);
  }
  if (s.verbDensity >= 0.5 && parts.length < 3) {
    parts.push('high action-verb density');
  }
  if (s.lengthScore >= 0.7 && parts.length < 3) {
    parts.push('long prompt');
  }
  if (s.contextBoost >= 0.2 && parts.length < 3) {
    parts.push('context: long transcript with tool churn');
  }
  if (parts.length === 0) {
    parts.push(s.recommendation === 'simple' ? 'short, single-step task' : 'moderate action count');
  }
  return `Signals: ${parts.join('; ')}.`;
}
