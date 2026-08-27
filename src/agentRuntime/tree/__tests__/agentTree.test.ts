import { beforeEach, describe, expect, it } from 'bun:test';
import { AgentTreeRegistry } from '../registry.js';

describe('Durable Agent Tree & Persistent Mailbox', () => {
  let registry: AgentTreeRegistry;

  beforeEach(() => {
    registry = new AgentTreeRegistry();
  });

  it('creates and tracks hierarchical agent nodes', () => {
    const rootSessionId = 'root_session_abc';

    const root = registry.createNode({
      name: 'Orchestrator',
      role: 'Lead planner',
      rootSessionId,
    });

    expect(root.depth).toBe(0);
    expect(root.status).toBe('running');

    const child = registry.createNode({
      name: 'Researcher',
      role: 'Codebase search',
      rootSessionId,
      parentAgentId: root.sessionId,
    });

    expect(child.depth).toBe(1);
    expect(child.parentAgentId).toBe(root.sessionId);

    const children = registry.getChildren(root.sessionId);
    expect(children.length).toBe(1);
    expect(children[0]!.sessionId).toBe(child.sessionId);
  });

  it('updates agent status and tracks active children', () => {
    const root = registry.createNode({
      name: 'Root',
      role: 'Root',
      rootSessionId: 'sess_1',
    });

    const c1 = registry.createNode({
      name: 'Worker 1',
      role: 'Worker',
      rootSessionId: 'sess_1',
      parentAgentId: root.sessionId,
    });

    const c2 = registry.createNode({
      name: 'Worker 2',
      role: 'Worker',
      rootSessionId: 'sess_1',
      parentAgentId: root.sessionId,
    });

    expect(registry.getActiveChildren(root.sessionId).length).toBe(2);

    registry.updateStatus(c1.sessionId, 'completed');
    expect(registry.getActiveChildren(root.sessionId).length).toBe(1);

    registry.updateStatus(c2.sessionId, 'error');
    expect(registry.getActiveChildren(root.sessionId).length).toBe(0);
  });

  it('handles durable mailbox message queuing and acknowledgement', () => {
    const msg = registry.mailbox.send('agent_sender', 'agent_receiver', 'Task update: done');
    expect(msg.read).toBe(false);
    expect(msg.acknowledged).toBe(false);

    const unread = registry.mailbox.getUnreadForAgent('agent_receiver');
    expect(unread.length).toBe(1);
    expect(unread[0]!.content).toBe('Task update: done');

    const ackResult = registry.mailbox.acknowledge(msg.id);
    expect(ackResult).toBe(true);

    expect(registry.mailbox.getUnreadForAgent('agent_receiver').length).toBe(0);
    expect(registry.mailbox.getHistoryForAgent('agent_receiver').length).toBe(1);
  });
});
