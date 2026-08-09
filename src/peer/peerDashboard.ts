/**
 * peerDashboard — Peer task dashboard.
 *
 * `collectPeerDashboard()` is the single data model: the text renderer below
 * (used by peer_manage({ action: 'list' }) and `/peer dashboard --text`) and
 * the interactive Ink view (`commands/peer/PeerDashboard.tsx`) both read from
 * it, so they can never drift apart.
 */

import { getGlobalPeerStore, type PeerStore } from './PeerStore.js';
import { formatPeerLatency, formatPeerLoad, getPeerHealth, type SwarmHealth, summarizePeers } from './peerHealth.js';
import type { BrokerMessage, MeshTodo } from './types.js';

const RESULT_PREVIEW_LENGTH = 120;

/** A todo assigned to (or received from) a peer, plus its reply if one arrived. */
export interface PeerDashboardTask {
  id: string;
  message: string;
  status: MeshTodo['status'];
  createdAt: number;
  /** Full reply text from the broker outbox, if the peer replied. */
  result?: string;
}

/** One peer row, with health telemetry and its tasks. */
export interface PeerDashboardPeer {
  id: string;
  name: string;
  role?: string;
  ip: string;
  port: number;
  health: SwarmHealth;
  /** Pre-formatted latency, e.g. `42ms` or `--`. */
  latency: string;
  /** Pre-formatted load, e.g. `idle`, `q2`, `busy+1`. */
  load: string;
  tasks: PeerDashboardTask[];
}

export interface PeerDashboardData {
  peers: PeerDashboardPeer[];
  /**
   * Tasks whose sender is not a connected peer (peer left, or was never
   * joined). The old dashboard dropped these silently.
   */
  unassigned: PeerDashboardTask[];
  totals: {
    peers: number;
    healthy: number;
    lagging: number;
    offline: number;
    avgLatencyMs?: number;
    tasks: number;
    pending: number;
    done: number;
    rejected: number;
  };
  /** Summary of state restored from a previous session, if any. */
  restored: string | null;
  generatedAt: number;
}

function toTask(todo: MeshTodo, replies: Map<string, BrokerMessage>): PeerDashboardTask {
  const reply = replies.get(todo.id);
  return {
    id: todo.id,
    message: todo.message,
    status: todo.status,
    createdAt: todo.createdAt,
    result: reply?.text,
  };
}

/**
 * Snapshot every connected peer, their tasks, and the health of the mesh.
 *
 * `store` is injectable so tests can build an isolated, non-persisting store
 * instead of mutating the process-global one.
 */
export function collectPeerDashboard(store: PeerStore = getGlobalPeerStore(), now = Date.now()): PeerDashboardData {
  const connections = store.getConnections().filter(peer => peer.port > 0);
  const todos = store.getTodos();

  // Broker replies are keyed by the todo id they answer.
  const replies = new Map<string, BrokerMessage>();
  for (const msg of store.getOutbox()) {
    if (msg.replyTo) replies.set(msg.replyTo, msg);
  }

  // Todos carry the *sender*'s name/id; match them back to a known peer by
  // hostname, display name, or id so a renamed peer keeps its tasks.
  const claimed = new Set<string>();
  const peers: PeerDashboardPeer[] = connections.map(peer => {
    const tags = store.getPeerTags(peer.id);
    const name = tags?.displayName || peer.hostname;
    const keys = new Set([peer.hostname.toLowerCase(), name.toLowerCase(), peer.id.toLowerCase()]);

    const tasks = todos
      .filter(todo => {
        const from = (todo.fromName || todo.from).toLowerCase();
        if (!keys.has(from)) return false;
        claimed.add(todo.id);
        return true;
      })
      .map(todo => toTask(todo, replies));

    return {
      id: peer.id,
      name,
      role: tags?.role,
      ip: peer.ip,
      port: peer.port,
      health: getPeerHealth(peer, now),
      latency: formatPeerLatency(peer),
      load: formatPeerLoad(peer),
      tasks,
    };
  });

  const unassigned = todos.filter(todo => !claimed.has(todo.id)).map(todo => toTask(todo, replies));
  const summary = summarizePeers(connections, now);

  const countByStatus = (status: MeshTodo['status']) => todos.filter(todo => todo.status === status).length;

  return {
    peers,
    unassigned,
    totals: {
      peers: connections.length,
      healthy: summary.healthy,
      lagging: summary.lagging,
      offline: summary.offline,
      avgLatencyMs: summary.avgLatencyMs,
      tasks: todos.length,
      pending: countByStatus('pending'),
      done: countByStatus('done'),
      rejected: countByStatus('rejected'),
    },
    restored: store.getRestoredSummary(),
    generatedAt: now,
  };
}

function statusIcon(status: MeshTodo['status']): string {
  return status === 'done' ? '☑' : status === 'rejected' ? '☒' : '☐';
}

function renderTaskLines(tasks: PeerDashboardTask[], indent: string): string[] {
  const lines: string[] = [];
  for (const task of tasks) {
    lines.push(`${indent}${statusIcon(task.status)} ${task.id.slice(0, 10)}: ${task.message} [${task.status}]`);
    if (task.result) {
      const preview =
        task.result.length > RESULT_PREVIEW_LENGTH ? `${task.result.slice(0, RESULT_PREVIEW_LENGTH)}...` : task.result;
      lines.push(`${indent}  ↳ result: "${preview}" (${task.result.length} chars)`);
    }
  }
  return lines;
}

/**
 * Format the full peer task dashboard as a text block.
 * Shows each connected peer with health/latency/load, their todos, and results.
 */
export function formatPeerTaskDashboard(store: PeerStore = getGlobalPeerStore(), now = Date.now()): string {
  const data = collectPeerDashboard(store, now);

  if (data.peers.length === 0 && data.totals.tasks === 0) {
    return '';
  }

  const sections: string[] = ['─── Peer Task Dashboard ───', ''];

  if (data.restored) {
    sections.push(`↺ ${data.restored}`, '');
  }

  if (data.peers.length === 0) {
    sections.push('(no connected peers)', '');
  }

  for (const peer of data.peers) {
    const role = peer.role ? ` [${peer.role}]` : '';
    const count = `${peer.tasks.length} task${peer.tasks.length !== 1 ? 's' : ''}`;
    sections.push(`${peer.name}${role} (port ${peer.port}) ─ ${count}`);
    sections.push(`  ${peer.health} · ${peer.latency} · ${peer.load} · ${peer.ip}:${peer.port}`);

    if (peer.tasks.length === 0) {
      sections.push('  (no tasks)');
    } else {
      sections.push(...renderTaskLines(peer.tasks, '  '));
    }

    sections.push('');
  }

  if (data.unassigned.length > 0) {
    sections.push(`Unassigned ─ ${data.unassigned.length} task(s) from peers no longer connected`);
    sections.push(...renderTaskLines(data.unassigned, '  '));
    sections.push('');
  }

  const { tasks, done, pending } = data.totals;
  sections.push(`─── ${tasks} task${tasks !== 1 ? 's' : ''} total · ${done} done · ${pending} pending ───`);

  return sections.join('\n');
}

/**
 * Format a compact one-line summary for use in enqueued notifications.
 */
export function formatPeerTaskSummary(store: PeerStore = getGlobalPeerStore()): string {
  const data = collectPeerDashboard(store);
  const { peers, tasks, done, pending } = data.totals;

  if (peers === 0 && tasks === 0) return '';

  return `[Peers: ${peers} · Tasks: ${done}/${tasks} done${pending > 0 ? ` · ${pending} pending` : ''}]`;
}

/**
 * Format LAN peer health as a text block — `/peer health`.
 */
export function formatPeerHealth(store: PeerStore = getGlobalPeerStore(), now = Date.now()): string {
  const data = collectPeerDashboard(store, now);

  if (data.peers.length === 0) {
    return 'No connected peers. Use /peer discover and /peer join first.';
  }

  const { healthy, lagging, offline, avgLatencyMs } = data.totals;
  const lines = [
    'Peer Health',
    `  ${healthy} healthy · ${lagging} lagging · ${offline} offline${
      avgLatencyMs !== undefined ? ` · avg ${Math.round(avgLatencyMs)}ms` : ''
    }`,
    '',
    `  ${'NAME'.padEnd(18)}${'ROLE'.padEnd(12)}${'HEALTH'.padEnd(9)}${'LATENCY'.padEnd(9)}${'LOAD'.padEnd(9)}ADDRESS`,
  ];

  for (const peer of data.peers) {
    lines.push(
      `  ${peer.name.slice(0, 17).padEnd(18)}${(peer.role ?? '-').slice(0, 11).padEnd(12)}${peer.health.padEnd(9)}${peer.latency.padEnd(9)}${peer.load.padEnd(9)}${peer.ip}:${peer.port}`,
    );
  }

  return lines.join('\n');
}
