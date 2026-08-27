/**
 * Data contracts and types for Rooted Resource Accounting and Circuit Breakers.
 */

export interface TokenUsageMetrics {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
}

export interface AccountingEntry {
  id: string;
  rootSessionId: string;
  agentId: string;
  parentAgentId?: string;
  depth: number;
  agentName: string;
  metrics: TokenUsageMetrics;
  timestamp: string;
}

export interface NodeAccountingSummary {
  agentId: string;
  agentName: string;
  parentAgentId?: string;
  depth: number;
  directMetrics: TokenUsageMetrics;
  subtreeMetrics: TokenUsageMetrics;
  children: NodeAccountingSummary[];
}

export interface CircuitBreakerConfig {
  maxDepth: number;
  maxChildrenPerAgent: number;
  maxSubtreeTokens: number;
  maxSubtreeCostUsd: number;
}

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  maxDepth: 3,
  maxChildrenPerAgent: 5,
  maxSubtreeTokens: 5_000_000, // 5M tokens cap per subtree
  maxSubtreeCostUsd: 15.0, // $15 max per subtree
};
