// Tests for TasteBandit

import { describe, expect, test } from 'bun:test';
import { TasteBandit } from '../core/TasteBandit.js';

describe('TasteBandit', () => {
  test('selects an arm', () => {
    const bandit = new TasteBandit(undefined, 1.0, true);
    const arm = bandit.selectArm();
    expect(['minimal', 'strict_style', 'architecture_first', 'test_first', 'safety_first', 'refactor_heavy']).toContain(
      arm,
    );
  });

  test('updates arm stats', () => {
    const bandit = new TasteBandit(undefined, 0.2, true);
    bandit.updateArm('minimal', 1.0);
    const state = bandit.getState();
    expect(state.arms.minimal.pulls).toBe(2); // constructor initializes with 1 pull
    expect(state.arms.minimal.totalReward).toBe(1.5); // 0.5 initial + 1.0
  });

  test('disabled bandit returns minimal arm', () => {
    const bandit = new TasteBandit(undefined, 0.2, false);
    const arm = bandit.selectArm();
    expect(arm).toBe('minimal');
  });

  test('prefers best arm with epsilon=0', () => {
    const bandit = new TasteBandit(undefined, 0, true);
    // Give strict_style a higher average
    bandit.updateArm('strict_style', 2.0);
    const arm = bandit.selectArm();
    expect(arm).toBe('strict_style');
  });

  test('decay epsilon', () => {
    const bandit = new TasteBandit(undefined, 0.5, true);
    bandit.decayEpsilon(0.5, 0.1);
    expect(bandit['epsilon']).toBe(0.25);
    bandit.decayEpsilon(0.5, 0.1);
    bandit.decayEpsilon(0.5, 0.1);
    expect(bandit['epsilon']).toBe(0.1); // hit min
  });

  test('setEpsilon clamps to valid range', () => {
    const bandit = new TasteBandit(undefined, 0.2, true);
    bandit.setEpsilon(1.5);
    expect(bandit['epsilon']).toBe(1.0);
    bandit.setEpsilon(-0.5);
    expect(bandit['epsilon']).toBe(0.0);
  });
});
