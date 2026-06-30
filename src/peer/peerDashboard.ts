/**
 * peerDashboard — Format peer task status as a text dashboard
 * for injection into the AI's context.
 */

import { getGlobalPeerStore } from './PeerStore.js';
import type { BrokerMessage, MeshTodo } from './types.js';

const RESULT_PREVIEW_LENGTH = 120;

/**
 * Format the full peer task dashboard as a text block.
 * Shows each connected peer, their todos, and any results/replies.
 */
export function formatPeerTaskDashboard(): string {
  const store = getGlobalPeerStore();
  const peers = store.getConnections().filter(p => p.port > 0);
  const todos = store.getTodos();
  const outbox = store.getOutbox();

  if (peers.length === 0 && todos.length === 0) {
    return '';
  }

  const sections: string[] = [];
  sections.push('─── Peer Task Dashboard ───');
  sections.push('');

  if (peers.length === 0) {
    sections.push('(no connected peers)');
    sections.push('');
  }

  // Group todos by which peer they were assigned to (the `from` field stores
  // the hostname of the peer that the todo was sent to).
  const todosByPeer = new Map<string, MeshTodo[]>();
  for (const todo of todos) {
    const key = todo.fromName || todo.from;
    const list = todosByPeer.get(key) ?? [];
    list.push(todo);
    todosByPeer.set(key, list);
  }

  // Group broker outbox replies by `replyTo` for result lookup
  const repliesByReplyTo = new Map<string, BrokerMessage>();
  for (const msg of outbox) {
    if (msg.replyTo) {
      repliesByReplyTo.set(msg.replyTo, msg);
    }
  }

  let totalTasks = 0;
  let doneTasks = 0;
  let runningTasks = 0;

  // Show each peer
  for (const peer of peers) {
    const tags = store.getPeerTags(peer.id);
    const name = tags?.displayName || peer.hostname;
    const peerTodos = todosByPeer.get(peer.hostname) ?? [];
    totalTasks += peerTodos.length;

    sections.push(`${name} (port ${peer.port}) ─ ${peerTodos.length} task${peerTodos.length !== 1 ? 's' : ''}`);

    if (peerTodos.length === 0) {
      sections.push('  (no tasks)');
    } else {
      for (const todo of peerTodos) {
        const icon = todo.status === 'done' ? '☑' : todo.status === 'rejected' ? '☒' : '☐';
        const statusLabel = todo.status === 'pending' ? 'pending' : todo.status === 'done' ? 'done' : 'rejected';

        if (todo.status === 'done') doneTasks++;
        if (todo.status === 'pending') runningTasks++;

        sections.push(`  ${icon} ${todo.id.slice(0, 10)}: ${todo.message} [${statusLabel}]`);

        // Show result if there's a reply
        const reply = repliesByReplyTo.get(todo.id);
        if (reply) {
          const preview =
            reply.text.length > RESULT_PREVIEW_LENGTH ? `${reply.text.slice(0, RESULT_PREVIEW_LENGTH)}...` : reply.text;
          sections.push(`    \u21b3 result: "${preview}" (${reply.text.length} chars)`);
        }
      }
    }

    sections.push('');
  }

  // Summary
  const summary = `${totalTasks} task${totalTasks !== 1 ? 's' : ''} total \u00b7 ${doneTasks} done \u00b7 ${runningTasks} pending`;
  sections.push(`\u2500\u2500\u2500 ${summary} \u2500\u2500\u2500`);

  return sections.join('\n');
}

/**
 * Format a compact one-line summary for use in enqueued notifications.
 */
export function formatPeerTaskSummary(): string {
  const store = getGlobalPeerStore();
  const peers = store.getConnections().filter(p => p.port > 0);
  const todos = store.getTodos();

  if (peers.length === 0 && todos.length === 0) return '';

  const done = todos.filter(t => t.status === 'done').length;
  const pending = todos.filter(t => t.status === 'pending').length;
  const total = todos.length;

  return `[Peers: ${peers.length} \u00b7 Tasks: ${done}/${total} done${pending > 0 ? ` \u00b7 ${pending} pending` : ''}]`;
}
