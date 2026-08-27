/**
 * Rooted Ledger — hierarchical token and cost accounting engine.
 */

import type { AccountingEntry, NodeAccountingSummary, TokenUsageMetrics } from './types.js';

export class RootedLedger {
  private entries: AccountingEntry[] = [];

  record(entry: Omit<AccountingEntry, 'id' | 'timestamp'>): AccountingEntry {
    const fullEntry: AccountingEntry = {
      ...entry,
      id: `acc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
    };
    this.entries.push(fullEntry);
    return fullEntry;
  }

  getEntriesForRoot(rootSessionId: string): AccountingEntry[] {
    return this.entries.filter(e => e.rootSessionId === rootSessionId);
  }

  /**
   * Computes hierarchical tree summary with recursive subtree rollups.
   */
  getTreeSummary(rootSessionId: string): NodeAccountingSummary | null {
    const rootEntries = this.getEntriesForRoot(rootSessionId);
    if (rootEntries.length === 0) return null;

    // Group direct metrics by agentId
    const agentMap = new Map<
      string,
      {
        agentName: string;
        parentAgentId?: string;
        depth: number;
        metrics: TokenUsageMetrics;
      }
    >();

    for (const entry of rootEntries) {
      const existing = agentMap.get(entry.agentId);
      if (existing) {
        existing.metrics.inputTokens += entry.metrics.inputTokens;
        existing.metrics.outputTokens += entry.metrics.outputTokens;
        existing.metrics.cacheReadTokens += entry.metrics.cacheReadTokens;
        existing.metrics.cacheWriteTokens += entry.metrics.cacheWriteTokens;
        existing.metrics.costUsd += entry.metrics.costUsd;
      } else {
        agentMap.set(entry.agentId, {
          agentName: entry.agentName,
          parentAgentId: entry.parentAgentId,
          depth: entry.depth,
          metrics: { ...entry.metrics },
        });
      }
    }

    // Identify root agent (depth 0 or no parent)
    const rootAgentId =
      Array.from(agentMap.keys()).find(id => {
        const node = agentMap.get(id);
        return !node?.parentAgentId || node.depth === 0;
      }) || Array.from(agentMap.keys())[0]!;

    const buildNode = (agentId: string): NodeAccountingSummary => {
      const info = agentMap.get(agentId) || {
        agentName: agentId,
        depth: 0,
        metrics: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0 },
      };

      const childIds = Array.from(agentMap.keys()).filter(id => agentMap.get(id)?.parentAgentId === agentId);
      const children = childIds.map(id => buildNode(id));

      const subtreeMetrics: TokenUsageMetrics = {
        inputTokens: info.metrics.inputTokens + children.reduce((sum, c) => sum + c.subtreeMetrics.inputTokens, 0),
        outputTokens: info.metrics.outputTokens + children.reduce((sum, c) => sum + c.subtreeMetrics.outputTokens, 0),
        cacheReadTokens:
          info.metrics.cacheReadTokens + children.reduce((sum, c) => sum + c.subtreeMetrics.cacheReadTokens, 0),
        cacheWriteTokens:
          info.metrics.cacheWriteTokens + children.reduce((sum, c) => sum + c.subtreeMetrics.cacheWriteTokens, 0),
        costUsd: info.metrics.costUsd + children.reduce((sum, c) => sum + c.subtreeMetrics.costUsd, 0),
      };

      return {
        agentId,
        agentName: info.agentName,
        parentAgentId: info.parentAgentId,
        depth: info.depth,
        directMetrics: { ...info.metrics },
        subtreeMetrics,
        children,
      };
    };

    return buildNode(rootAgentId);
  }

  /**
   * Formats tree summary into a human-readable ASCII report for /cost.
   */
  formatTreeReport(summary: NodeAccountingSummary, indent = ''): string {
    const lines: string[] = [];
    const directTotal =
      summary.directMetrics.inputTokens +
      summary.directMetrics.outputTokens +
      summary.directMetrics.cacheReadTokens +
      summary.directMetrics.cacheWriteTokens;
    const subtreeTotal =
      summary.subtreeMetrics.inputTokens +
      summary.subtreeMetrics.outputTokens +
      summary.subtreeMetrics.cacheReadTokens +
      summary.subtreeMetrics.cacheWriteTokens;

    const prefix = indent ? `${indent}└── ` : '🌳 ';
    const costStr = `$${summary.subtreeMetrics.costUsd.toFixed(4)}`;
    lines.push(
      `${prefix}${summary.agentName} (id: ${summary.agentId}) [${costStr} | subtree: ${subtreeTotal.toLocaleString()} tokens, direct: ${directTotal.toLocaleString()} tokens]`,
    );

    const childIndent = indent ? `${indent}    ` : '   ';
    for (const child of summary.children) {
      lines.push(this.formatTreeReport(child, childIndent));
    }

    return lines.join('\n');
  }

  clear(): void {
    this.entries = [];
  }
}

// Global Singleton
let globalLedger: RootedLedger | null = null;
export function getRootedLedger(): RootedLedger {
  if (!globalLedger) {
    globalLedger = new RootedLedger();
  }
  return globalLedger;
}
