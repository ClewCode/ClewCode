/**
 * Durable Agent Tree Registry — tracks hierarchical agent topology and lifecycle.
 */

import { DurableMailbox } from './mailbox.js';
import type { AgentNodeStatus, AgentSessionNode, CreateAgentNodeOptions } from './types.js';

export class AgentTreeRegistry {
  private nodes = new Map<string, AgentSessionNode>();
  public readonly mailbox = new DurableMailbox();

  createNode(options: CreateAgentNodeOptions): AgentSessionNode {
    const sessionId = `agent_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const handle = options.handle || options.name.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const now = new Date().toISOString();

    const node: AgentSessionNode = {
      sessionId,
      handle,
      name: options.name,
      role: options.role,
      rootSessionId: options.rootSessionId,
      parentAgentId: options.parentAgentId,
      depth: options.depth ?? (options.parentAgentId ? (this.nodes.get(options.parentAgentId)?.depth ?? 0) + 1 : 0),
      status: 'running',
      createdAt: now,
      updatedAt: now,
      budgetLimitTokens: options.budgetLimitTokens,
    };

    this.nodes.set(sessionId, node);
    return node;
  }

  getNode(sessionId: string): AgentSessionNode | undefined {
    return this.nodes.get(sessionId);
  }

  updateStatus(sessionId: string, status: AgentNodeStatus): boolean {
    const node = this.nodes.get(sessionId);
    if (!node) return false;
    node.status = status;
    node.updatedAt = new Date().toISOString();
    return true;
  }

  getChildren(parentAgentId: string): AgentSessionNode[] {
    return Array.from(this.nodes.values()).filter(n => n.parentAgentId === parentAgentId);
  }

  getActiveChildren(parentAgentId: string): AgentSessionNode[] {
    return this.getChildren(parentAgentId).filter(n => n.status === 'running' || n.status === 'needs-input');
  }

  getTreeForRoot(rootSessionId: string): AgentSessionNode[] {
    return Array.from(this.nodes.values()).filter(n => n.rootSessionId === rootSessionId);
  }

  clear(): void {
    this.nodes.clear();
    this.mailbox.clear();
  }
}

// Global Singleton
let globalAgentRegistry: AgentTreeRegistry | null = null;
export function getAgentTreeRegistry(): AgentTreeRegistry {
  if (!globalAgentRegistry) {
    globalAgentRegistry = new AgentTreeRegistry();
  }
  return globalAgentRegistry;
}
