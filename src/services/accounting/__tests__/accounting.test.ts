import { beforeEach, describe, expect, it } from 'bun:test';
import { CircuitBreaker } from '../circuitBreaker.js';
import { RootedLedger } from '../ledger.js';

describe('Rooted Resource Accounting & Circuit Breakers', () => {
  let ledger: RootedLedger;
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    ledger = new RootedLedger();
    circuitBreaker = new CircuitBreaker({
      maxDepth: 3,
      maxChildrenPerAgent: 5,
      maxSubtreeTokens: 100_000,
      maxSubtreeCostUsd: 1.0,
    });
  });

  it('blocks recursion when maxDepth is exceeded', () => {
    expect(circuitBreaker.canSpawnChild(0, 0).allowed).toBe(true);
    expect(circuitBreaker.canSpawnChild(2, 2).allowed).toBe(true);

    const depthCheck = circuitBreaker.canSpawnChild(3, 1);
    expect(depthCheck.allowed).toBe(false);
    expect(depthCheck.reason).toContain('Max agent recursion depth exceeded');
  });

  it('blocks child spawn when maxChildrenPerAgent is exceeded', () => {
    expect(circuitBreaker.canSpawnChild(1, 4).allowed).toBe(true);

    const childCheck = circuitBreaker.canSpawnChild(1, 5);
    expect(childCheck.allowed).toBe(false);
    expect(childCheck.reason).toContain('Max concurrent subagents reached');
  });

  it('blocks when subtree budget limit is exceeded', () => {
    expect(
      circuitBreaker.checkSubtreeBudget({
        inputTokens: 10_000,
        outputTokens: 5_000,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        costUsd: 0.2,
      }).allowed,
    ).toBe(true);

    const budgetCheck = circuitBreaker.checkSubtreeBudget({
      inputTokens: 60_000,
      outputTokens: 50_000,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costUsd: 1.5,
    });
    expect(budgetCheck.allowed).toBe(false);
    expect(budgetCheck.reason).toContain('Subtree token budget exceeded');
  });

  it('correctly aggregates hierarchical tree token & cost metrics', () => {
    const rootSession = 'root_sess_100';

    // Root agent
    ledger.record({
      rootSessionId: rootSession,
      agentId: 'root_agent',
      depth: 0,
      agentName: 'MainAgent',
      metrics: { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 500, cacheWriteTokens: 100, costUsd: 0.05 },
    });

    // Subagent 1
    ledger.record({
      rootSessionId: rootSession,
      agentId: 'sub_1',
      parentAgentId: 'root_agent',
      depth: 1,
      agentName: 'CodeSearcher',
      metrics: { inputTokens: 2000, outputTokens: 500, cacheReadTokens: 1000, cacheWriteTokens: 200, costUsd: 0.1 },
    });

    // Subagent 1.1 (child of Subagent 1)
    ledger.record({
      rootSessionId: rootSession,
      agentId: 'sub_1_1',
      parentAgentId: 'sub_1',
      depth: 2,
      agentName: 'AstParser',
      metrics: { inputTokens: 500, outputTokens: 100, cacheReadTokens: 200, cacheWriteTokens: 50, costUsd: 0.02 },
    });

    const summary = ledger.getTreeSummary(rootSession);
    expect(summary).not.toBeNull();
    expect(summary!.agentId).toBe('root_agent');

    // Root direct cost: 0.05
    expect(summary!.directMetrics.costUsd).toBe(0.05);

    // Subtree total cost: 0.05 + 0.10 + 0.02 = 0.17
    expect(summary!.subtreeMetrics.costUsd).toBeCloseTo(0.17);

    // Subtree total input tokens: 1000 + 2000 + 500 = 3500
    expect(summary!.subtreeMetrics.inputTokens).toBe(3500);

    const report = ledger.formatTreeReport(summary!);
    expect(report).toContain('MainAgent');
    expect(report).toContain('CodeSearcher');
    expect(report).toContain('AstParser');
  });
});
