import { describe, expect, test } from 'bun:test';
import {
  buildUltracodeSuggestion,
  classifyTranscript,
} from '../../src/agentRuntime/transcriptClassifier.ts';

describe('classifyTranscript', () => {
  test('scores a trivial prompt as simple with no suggestion', () => {
    const r = classifyTranscript({ prompt: 'fix the typo' });
    expect(r.recommendation).toBe('simple');
    expect(r.score).toBeLessThan(0.55);
    expect(r.shouldSuggestUltracode).toBe(false);
  });

  test('rates a long migration prompt as complex', () => {
    const r = classifyTranscript({
      prompt:
        'Migrate this entire service from CommonJS to ESM across all files, update every test, and verify the build still works end-to-end. Audit the imports, refactor across the codebase, and add migration notes for downstream teams.',
    });
    expect(r.recommendation).toBe('complex');
    expect(r.score).toBeGreaterThanOrEqual(0.65);
    expect(r.shouldSuggestUltracode).toBe(true);
    expect(r.signals.keywordHits.length).toBeGreaterThan(0);
    expect(r.signals.scopeHits.length).toBeGreaterThan(0);
  });

  test('rates a single-verb-but-long prompt as moderate or simple', () => {
    const r = classifyTranscript({
      prompt:
        'Explain in great detail how the database connection pool works in this codebase, including the rationale for the chosen pool size, the timeout behavior, and how it interacts with the rest of the request lifecycle. Be thorough.',
    });
    expect(r.recommendation).not.toBe('complex');
    expect(r.shouldSuggestUltracode).toBe(false);
  });

  test('rates security audit prompt as complex', () => {
    const r = classifyTranscript({
      prompt: 'security review and audit of the auth module, check every service, repo-wide',
    });
    expect(r.recommendation).toBe('complex');
  });

  test('empty prompt is simple with zero score', () => {
    const r = classifyTranscript({ prompt: '' });
    expect(r.score).toBe(0);
    expect(r.recommendation).toBe('simple');
  });

  test('context boost raises a moderate prompt into the suggestion range', () => {
    const base = classifyTranscript({
      prompt: 'Refactor the auth module and add tests for the new endpoints',
    });
    const withContext = classifyTranscript({
      prompt: 'Refactor the auth module and add tests for the new endpoints',
      context: { priorTurns: 30, toolCallCount: 60, lastTurnErrored: true },
    });
    expect(withContext.score).toBeGreaterThan(base.score);
    // 30+ prior turns + 60+ tool calls + a recent error are a strong
    // "this is hard" signal — the boost should be noticeable.
    expect(withContext.signals.contextBoost).toBeGreaterThan(0.4);
  });

  test('context boost is clamped at 1.0', () => {
    const r = classifyTranscript({
      prompt: 'a',
      context: { priorTurns: 1000, toolCallCount: 10000, lastTurnErrored: true },
    });
    expect(r.score).toBeLessThanOrEqual(1);
    expect(Number.isFinite(r.score)).toBe(true);
  });

  test('long prompt with many distinct verbs tips into the suggestion band', () => {
    const r = classifyTranscript({
      prompt:
        'Migrate the auth module: fix the bug, update tests, replace the deprecated API, add migration notes, remove the legacy shim, refactor across the helper, document the new behaviour, and review the diff for regressions across all files.',
    });
    expect(r.shouldSuggestUltracode).toBe(true);
  });
});

describe('buildUltracodeSuggestion', () => {
  test('returns null for trivial tasks', () => {
    const r = classifyTranscript({ prompt: 'fix this' });
    expect(buildUltracodeSuggestion(r)).toBeNull();
  });

  test('returns a one-line hint for complex tasks', () => {
    const r = classifyTranscript({
      prompt: 'migrate this entire service from CommonJS to ESM across all files end-to-end',
    });
    const msg = buildUltracodeSuggestion(r);
    expect(msg).not.toBeNull();
    expect(msg).toContain('ultracode');
    expect(msg).toContain('complex');
  });
});

describe('classifyTranscript with goal context', () => {
  test('paused goal adds a context boost', () => {
    const baseline = classifyTranscript({ prompt: 'fix the typo' });
    const withPaused = classifyTranscript({ prompt: 'fix the typo', context: { goalPaused: true } });
    expect(withPaused.score).toBeGreaterThanOrEqual(baseline.score);
  });

  test('goalProgress >= 0.7 nudges a moderate prompt up', () => {
    const baseline = classifyTranscript({
      prompt: 'fix a small bug in the parser and verify the build still works',
    });
    const withGoal = classifyTranscript({
      prompt: 'fix a small bug in the parser and verify the build still works',
      context: { goalProgress: 0.85 },
    });
    expect(withGoal.score).toBeGreaterThanOrEqual(baseline.score);
  });

  test('goalProgress = 0 has no effect', () => {
    const baseline = classifyTranscript({ prompt: 'fix a typo' });
    const withZero = classifyTranscript({ prompt: 'fix a typo', context: { goalProgress: 0 } });
    expect(withZero.score).toBe(baseline.score);
  });

  test('goal context alone cannot push a simple task past the suggest threshold', () => {
    const r = classifyTranscript({ prompt: 'fix a typo', context: { goalPaused: true, goalProgress: 0.95 } });
    // ContextBoost is capped at 0.1 + 0.2 = 0.3; for a simple prompt
    // that should still keep us under 0.55.
    expect(r.shouldSuggestUltracode).toBe(false);
  });
});
