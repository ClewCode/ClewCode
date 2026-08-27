/**
 * Types and contracts for Durable Agent Session Tree and Persistent Mailbox.
 */

export type AgentNodeStatus = 'running' | 'needs-input' | 'idle' | 'completed' | 'error' | 'canceled';

export interface DurableMessage {
  id: string;
  senderAgentId: string;
  recipientAgentId: string;
  content: string;
  timestamp: string;
  read: boolean;
  acknowledged: boolean;
}

export interface AgentSessionNode {
  sessionId: string;
  handle: string;
  name: string;
  role: string;
  rootSessionId: string;
  parentAgentId?: string;
  depth: number;
  status: AgentNodeStatus;
  createdAt: string;
  updatedAt: string;
  budgetLimitTokens?: number;
}

export interface CreateAgentNodeOptions {
  name: string;
  role: string;
  rootSessionId: string;
  parentAgentId?: string;
  depth?: number;
  handle?: string;
  budgetLimitTokens?: number;
}
