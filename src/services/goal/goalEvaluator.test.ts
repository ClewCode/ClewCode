import { describe, expect, test } from 'bun:test';
import { evaluateGoal, parseGoalBounds } from './goalEvaluator.js';

describe('parseGoalBounds', () => {
  test('extracts turn limits from goal text', () => {
    expect(parseGoalBounds('all tests pass or stop after 20 turns')).toEqual({
      condition: 'all tests pass',
      maxTurns: 20,
      maxMinutes: undefined,
    });
  });

  test('extracts hour limits as minutes', () => {
    expect(parseGoalBounds('build is green or stop after 1.5 hours')).toEqual({
      condition: 'build is green',
      maxTurns: undefined,
      maxMinutes: 90,
    });
  });
});

describe('evaluateGoal', () => {
  test('turn limit stops without marking the goal as met', async () => {
    const result = await evaluateGoal('all tests pass', [], 20, Date.now(), 20);

    expect(result.met).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.budgetExhausted).toBe(true);
    expect(result.reason).toBe('Turn limit reached: 20/20 turns');
    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
  });

  test('time limit stops without marking the goal as met', async () => {
    const startedTwoMinutesAgo = Date.now() - 120_000;
    const result = await evaluateGoal('build is green', [], 1, startedTwoMinutesAgo, undefined, 1);

    expect(result.met).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.budgetExhausted).toBe(true);
    expect(result.reason).toBe('Time limit reached: 2/1 minutes');
    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
  });
});
