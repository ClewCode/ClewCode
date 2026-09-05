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
