// Tests for TasteRewardModel

import { describe, expect, test } from 'bun:test';
import { computeReward } from '../core/TasteRewardModel.js';

describe('TasteRewardModel', () => {
  test('accept returns +1.0', () => {
    const result = computeReward({ type: 'accept' });
    expect(result.reward).toBe(1.0);
    expect(result.label).toBe('accept');
  });

  test('reject returns -1.0', () => {
    const result = computeReward({ type: 'reject' });
    expect(result.reward).toBe(-1.0);
  });

  test('test_pass returns +0.4', () => {
    const result = computeReward({ type: 'test_pass' });
    expect(result.reward).toBe(0.4);
  });

  test('test_fail returns -0.4', () => {
    const result = computeReward({ type: 'test_fail' });
    expect(result.reward).toBe(-0.4);
  });

  test('lint_pass returns +0.2', () => {
    const result = computeReward({ type: 'lint_pass' });
    expect(result.reward).toBe(0.2);
  });

  test('lint_fail returns -0.2', () => {
    const result = computeReward({ type: 'lint_fail' });
    expect(result.reward).toBe(-0.2);
  });

  test('tool_success returns +0.1', () => {
    const result = computeReward({ type: 'tool_success' });
    expect(result.reward).toBe(0.1);
  });

  test('tool_failure returns -0.2', () => {
    const result = computeReward({ type: 'tool_failure' });
    expect(result.reward).toBe(-0.2);
  });

  test('manual_rule returns +0.8', () => {
    const result = computeReward({ type: 'manual_rule' });
    expect(result.reward).toBe(0.8);
  });

  test('tiny edit returns +0.7', () => {
    const result = computeReward({ type: 'edit', changeRatio: 0.05 });
    expect(result.reward).toBe(0.7);
  });

  test('medium edit returns +0.2', () => {
    const result = computeReward({ type: 'edit', changeRatio: 0.25 });
    expect(result.reward).toBe(0.2);
  });

  test('heavy edit returns -0.4', () => {
    const result = computeReward({ type: 'edit', changeRatio: 0.5 });
    expect(result.reward).toBe(-0.4);
  });
});
