/**
 * Durable Mailbox — persistent message queue for subagents and swarms.
 */

import type { DurableMessage } from './types.js';

export class DurableMailbox {
  private messages = new Map<string, DurableMessage>();

  send(senderAgentId: string, recipientAgentId: string, content: string): DurableMessage {
    const id = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const message: DurableMessage = {
      id,
      senderAgentId,
      recipientAgentId,
      content,
      timestamp: new Date().toISOString(),
      read: false,
      acknowledged: false,
    };

    this.messages.set(id, message);
    return message;
  }

  getUnreadForAgent(agentId: string): DurableMessage[] {
    return Array.from(this.messages.values()).filter(m => m.recipientAgentId === agentId && !m.read);
  }

  markRead(messageId: string): boolean {
    const msg = this.messages.get(messageId);
    if (!msg) return false;
    msg.read = true;
    return true;
  }

  acknowledge(messageId: string): boolean {
    const msg = this.messages.get(messageId);
    if (!msg) return false;
    msg.acknowledged = true;
    msg.read = true;
    return true;
  }

  getHistoryForAgent(agentId: string): DurableMessage[] {
    return Array.from(this.messages.values()).filter(
      m => m.senderAgentId === agentId || m.recipientAgentId === agentId,
    );
  }

  clear(): void {
    this.messages.clear();
  }
}
