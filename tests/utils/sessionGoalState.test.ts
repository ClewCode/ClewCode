/**
 * Tests for `src/utils/sessionGoalState.ts` — the in-memory + persisted
 * slot that backs `/goal`. We test the in-memory contract only; the
 * persistence layer is best-effort and silently swallows errors in
 * tests where `getSessionId`/`getCwd` may not be wired up.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import type { GoalState } from '../../src/utils/sessionGoalState.ts';

let state: typeof import('../../src/utils/sessionGoalState.ts');

async function freshImport() {
  // @ts-expect-error - dynamic import to bust the module cache so each
  // test gets a fresh singleton.
  state = await import('../../src/utils/sessionGoalState.ts?' + Math.random());
}

beforeEach(async () => {
  await freshImport();
  // Belt + suspenders: clear any lingering state from prior tests.
  state.setFullGoalState(null);
});

afterEach(() => {
  // Always end each test with no active goal so we don't leak into
  // sibling test files.
  state.setFullGoalState(null);
  state.setFullGoalState(null); // snapshots the snapshot clear → lastAchieved = null
});

describe('sessionGoalState', () => {
  test('setFullGoalState stores a fresh goal', async () => {
    const goal: GoalState = {
      goal: 'ship the feature',
      condition: 'ship the feature',
      setAt: 1000,
      turnCount: 0,
      evalTokens: 0,
    };
    state.setFullGoalState(goal);
    expect(state.getFullGoalState()).toEqual(goal);
  });

  test('setFullGoalState(null) snapshots an active goal into lastAchieved', async () => {
    state.setFullGoalState({
      goal: 'finish the audit',
      condition: 'finish the audit',
      setAt: 1000,
      endedAt: 2000,
      turnCount: 4,
      evalTokens: 800,
      achieved: true,
    });
    state.setFullGoalState(null);
    const last = state.getLastAchieved();
    expect(last).not.toBeNull();
    expect(last?.goal).toBe('finish the audit');
    expect(last?.turnCount).toBe(4);
    expect(last?.achieved).toBe(true);
  });

  test('setFullGoalState(null) from a null initial state does not record lastAchieved', async () => {
    // First ensure we are starting clean.
    state.setFullGoalState(null);
    // second null overwrites prior lastAchieved with null via the
    // belt+suspenders call, so call freshImport once more.
    await freshImport();
    state.setFullGoalState(null);
    expect(state.getLastAchieved()).toBeNull();
  });

  test('setFullGoalState(null) overwrites lastAchieved on the next finish', async () => {
    state.setFullGoalState({ goal: 'one', condition: 'one', setAt: 1 });
    state.setFullGoalState(null);
    state.setFullGoalState({ goal: 'two', condition: 'two', setAt: 2 });
    state.setFullGoalState(null);
    expect(state.getLastAchieved()?.goal).toBe('two');
  });

  test('linkWorkflowToActiveGoal appends and is idempotent', async () => {
    state.setFullGoalState({ goal: 'g', condition: 'g', setAt: 1 });
    state.linkWorkflowToActiveGoal('run-1');
    state.linkWorkflowToActiveGoal('run-2');
    state.linkWorkflowToActiveGoal('run-1');
    const stored = state.getFullGoalState();
    expect(stored?.linkedWorkflowRunIds).toEqual(['run-1', 'run-2']);
  });

  test('linkWorkflowToActiveGoal is a no-op when no goal is active', async () => {
    state.linkWorkflowToActiveGoal('orphan');
    expect(state.getFullGoalState()).toBeNull();
  });

  test('updateGoalState merges fields into the active goal', async () => {
    state.setFullGoalState({ goal: 'g', condition: 'g', setAt: 1, turnCount: 0 });
    state.updateGoalState({ turnCount: 3, evalTokens: 250 });
    const after = state.getFullGoalState();
    expect(after?.turnCount).toBe(3);
    expect(after?.evalTokens).toBe(250);
    // Other fields preserved
    expect(after?.goal).toBe('g');
    expect(after?.setAt).toBe(1);
  });

  test('updateGoalState on a missing goal is a no-op', async () => {
    state.updateGoalState({ turnCount: 5 });
    expect(state.getFullGoalState()).toBeNull();
  });

  test('linkWorkflowToActiveGoal preserves prior linked ids across other mutations', async () => {
    state.setFullGoalState({ goal: 'g', condition: 'g', setAt: 1 });
    state.linkWorkflowToActiveGoal('run-1');
    state.updateGoalState({ turnCount: 2 });
    expect(state.getFullGoalState()?.linkedWorkflowRunIds).toEqual(['run-1']);
  });
});
