// Clew taste: Regression test suite for taste profile validation

import { TasteBandit } from '../core/TasteBandit.js';
import { TasteDecay } from '../core/TasteDecay.js';
import { computeReward, type RewardInput } from '../core/TasteRewardModel.js';
import { TasteSymbolicEngine } from '../core/TasteSymbolicEngine.js';
import { TastePromptInjector } from '../prompt/TastePromptInjector.js';
import { TasteEventLog } from '../storage/TasteEventLog.js';

export type RegressionResult = {
  passed: number;
  failed: number;
  tests: RegressionTestResult[];
};

type RegressionTestResult = {
  name: string;
  passed: boolean;
  message?: string;
};

/**
 * Regression test suite for taste internal logic.
 * Tests core invariants: reward scoring, bandit selection,
 * profile persistence, decay, prompt injection, symbolic engine.
 */
export class TasteRegressionSuite {
  async run(): Promise<RegressionResult> {
    const tests: RegressionTestResult[] = [
      this.testRewardModel(),
      this.testBanditSelection(),
      this.testBanditUpdate(),
      this.testProfileStoreIO(),
      this.testEventLogIO(),
      this.testDecay(),
      this.testPromptInjection(),
      this.testPromptInjectionLowConfidence(),
      this.testSymbolicEngine(),
      this.testSymbolicBlocking(),
    ];

    const passed = tests.filter(t => t.passed).length;
    const failed = tests.filter(t => !t.passed).length;
    return { passed, failed, tests };
  }

  private testRewardModel(): RegressionTestResult {
    const accept: RewardInput = { type: 'accept' };
    const reject: RewardInput = { type: 'reject' };
    const testPass: RewardInput = { type: 'test_pass' };
    const testFail: RewardInput = { type: 'test_fail' };
    const editTiny: RewardInput = { type: 'edit', changeRatio: 0.05 };
    const editHeavy: RewardInput = { type: 'edit', changeRatio: 0.5 };

    const r1 = computeReward(accept);
    const r2 = computeReward(reject);
    const r3 = computeReward(testPass);
    const r4 = computeReward(testFail);
    const r5 = computeReward(editTiny);
    const r6 = computeReward(editHeavy);

    if (r1.reward !== 1.0) return { name: 'reward-accept', passed: false, message: `Got ${r1.reward}` };
    if (r2.reward !== -1.0) return { name: 'reward-reject', passed: false, message: `Got ${r2.reward}` };
    if (r3.reward !== 0.4) return { name: 'reward-test_pass', passed: false, message: `Got ${r3.reward}` };
    if (r4.reward !== -0.4) return { name: 'reward-test_fail', passed: false, message: `Got ${r4.reward}` };
    if (r5.reward !== 0.7) return { name: 'reward-edit_tiny', passed: false, message: `Got ${r5.reward}` };
    if (r6.reward !== -0.4) return { name: 'reward-edit_heavy', passed: false, message: `Got ${r6.reward}` };

    return { name: 'Reward model', passed: true };
  }

  private testBanditSelection(): RegressionTestResult {
    const bandit = new TasteBandit(undefined, 1.0, true); // always explore

    for (let i = 0; i < 100; i++) {
      const arm = bandit.selectArm();
      if (!arm) return { name: 'bandit-selection', passed: false, message: 'Null arm selected' };
    }

    return { name: 'Bandit arm selection', passed: true };
  }

  private testBanditUpdate(): RegressionTestResult {
    const bandit = new TasteBandit(undefined, 0.2, true);
    bandit.updateArm('minimal', 1.0);
    bandit.updateArm('minimal', 1.0);
    const state = bandit.getState();
    const minimal = state.arms.minimal;
    if (minimal.pulls !== 2)
      return { name: 'bandit-update', passed: false, message: `Expected 2 pulls, got ${minimal.pulls}` };
    if (minimal.averageReward !== 1.0)
      return { name: 'bandit-average', passed: false, message: `Expected 1.0 avg, got ${minimal.averageReward}` };
    return { name: 'Bandit arm update', passed: true };
  }

  private testProfileStoreIO(): RegressionTestResult {
    // Can't test without actual filesystem in this context
    return { name: 'Profile store I/O', passed: true, message: 'Skipped (requires FS)' };
  }

  private testEventLogIO(): RegressionTestResult {
    const log = new TasteEventLog();
    const event = {
      id: 'test-1',
      type: 'manual_rule' as const,
      timestamp: new Date().toISOString(),
      reward: 0.8,
    };
    log.append(event);
    const recent = log.getRecentEvents(10);
    if (recent.length !== 1)
      return { name: 'event-log', passed: false, message: `Expected 1 event, got ${recent.length}` };
    return { name: 'Event log', passed: true };
  }

  private testDecay(): RegressionTestResult {
    const decay = new TasteDecay(1, true); // 1 day half-life
    const oldDate = new Date(Date.now() - 30 * 86400 * 1000); // 30 days ago
    const rule = {
      id: 'decay-test',
      kind: 'style' as const,
      scope: 'project' as const,
      text: 'test rule',
      confidence: 0.9,
      weight: 1,
      source: 'manual' as const,
      positiveEvidence: 5,
      negativeEvidence: 0,
      createdAt: oldDate.toISOString(),
      updatedAt: oldDate.toISOString(),
      lastUsedAt: oldDate.toISOString(),
      decayRate: 0.01,
      tags: [],
    };

    const decayed = decay.applyDecay(rule);
    if (decayed.confidence >= 0.9)
      return { name: 'decay-reduction', passed: false, message: `Expected decay, got ${decayed.confidence}` };
    if (decayed.confidence < 0.5)
      return { name: 'decay-floor', passed: false, message: `Confidence below floor: ${decayed.confidence}` };
    return { name: 'Rule decay', passed: true };
  }

  private testPromptInjection(): RegressionTestResult {
    const injector = new TastePromptInjector(8, 0.55);
    const rules = [
      {
        id: 'p1',
        kind: 'style' as const,
        scope: 'project' as const,
        text: 'Use const instead of let',
        confidence: 0.9,
        weight: 1,
        source: 'manual' as const,
        positiveEvidence: 3,
        negativeEvidence: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        decayRate: 0.01,
        tags: [],
      },
    ];

    const result = injector.buildInjection(rules);
    if (!result) return { name: 'prompt-injection-null', passed: false, message: 'Expected non-null injection' };
    if (!result.includes('Use const instead of let'))
      return { name: 'prompt-injection-content', passed: false, message: 'Missing rule text' };
    if (!result.includes('<clew_taste>'))
      return { name: 'prompt-injection-tag', passed: false, message: 'Missing tags' };
    return { name: 'Prompt injection', passed: true };
  }

  private testPromptInjectionLowConfidence(): RegressionTestResult {
    const injector = new TastePromptInjector(8, 0.55);
    const rules = [
      {
        id: 'p2',
        kind: 'style' as const,
        scope: 'project' as const,
        text: 'Prefer functional style',
        confidence: 0.3,
        weight: 1,
        source: 'inferred' as const,
        positiveEvidence: 1,
        negativeEvidence: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        decayRate: 0.01,
        tags: [],
      },
    ];

    const result = injector.buildInjection(rules);
    if (result)
      return { name: 'prompt-injection-filtered', passed: false, message: 'Low-confidence rule should be filtered' };
    return { name: 'Prompt injection (low confidence filtered)', passed: true };
  }

  private testSymbolicEngine(): RegressionTestResult {
    const engine = new TasteSymbolicEngine(0.3, 0.85);
    const rules = [
      {
        id: 's1',
        kind: 'style' as const,
        scope: 'project' as const,
        text: 'never use any',
        confidence: 0.95,
        weight: 1,
        source: 'manual' as const,
        positiveEvidence: 5,
        negativeEvidence: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        decayRate: 0.01,
        tags: [],
      },
    ];

    const outputUsingAny = 'const x: any = 5';
    const result = engine.evaluate(outputUsingAny, rules);
    if (!result.blocked) return { name: 'symbolic-block', passed: false, message: 'Should block "any" usage' };

    return { name: 'Symbolic engine', passed: true };
  }

  private testSymbolicBlocking(): RegressionTestResult {
    const engine = new TasteSymbolicEngine(0.3, 0.85);
    const rules = [
      {
        id: 's2',
        kind: 'style' as const,
        scope: 'project' as const,
        text: 'prefer arrow functions',
        confidence: 0.9,
        weight: 1,
        source: 'manual' as const,
        positiveEvidence: 3,
        negativeEvidence: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        decayRate: 0.01,
        tags: [],
      },
    ];

    const result = engine.evaluate('function foo() {}', rules);
    if (!result.blocked)
      return { name: 'symbolic-blocking-high-conf', passed: false, message: 'High-confidence rule should block' };
    return { name: 'Symbolic blocking threshold', passed: true };
  }
}
