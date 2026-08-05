import { afterEach, describe, expect, test } from 'bun:test';
import { PeerStore } from './PeerStore.js';
import {
  collectPeerDashboard,
  formatPeerHealth,
  formatPeerTaskDashboard,
  formatPeerTaskSummary,
} from './peerDashboard.js';
import type { BrokerMessage, MeshTodo, PeerInfo } from './types.js';

const NOW = 1_000_000;

const stores: PeerStore[] = [];

function makeStore(): PeerStore {
  const store = new PeerStore(undefined, { persist: false });
  stores.push(store);
  return store;
}

afterEach(() => {
  for (const store of stores.splice(0)) store.destroy();
});

function peer(overrides: Partial<PeerInfo> = {}): PeerInfo {
  return {
    id: 'peer-a',
    hostname: 'worker-a',
    ip: '10.0.0.2',
    port: 4200,
    cwd: '/repo',
    version: 'test',
    lastSeen: NOW,
    status: 'online',
    latencyMs: 20,
    ...overrides,
  };
}

function todo(overrides: Partial<MeshTodo> = {}): MeshTodo {
  return {
    id: 'todo-0001-aaaa',
    from: 'peer-a',
    fromName: 'worker-a',
    message: 'run the tests',
    createdAt: NOW - 5_000,
    status: 'pending',
    ...overrides,
  };
}

function reply(replyTo: string, text: string): BrokerMessage {
  return {
    id: `reply-${replyTo}`,
    from: 'peer-a',
    fromName: 'worker-a',
    to: 'local',
    text,
    replyTo,
    timestamp: NOW,
    delivered: false,
  };
}

describe('collectPeerDashboard', () => {
  test('returns empty totals when nothing is connected', () => {
    const data = collectPeerDashboard(makeStore(), NOW);
    expect(data.peers).toEqual([]);
    expect(data.totals.peers).toBe(0);
    expect(data.totals.tasks).toBe(0);
    expect(formatPeerTaskDashboard(makeStore())).toBe('');
    expect(formatPeerTaskSummary(makeStore())).toBe('');
  });

  test('groups tasks under their peer with health telemetry', () => {
    const store = makeStore();
    store.addConnection(peer());
    store.addTodo(todo());
    store.addTodo(todo({ id: 'todo-0002-bbbb', status: 'done', message: 'lint' }));

    const data = collectPeerDashboard(store, NOW);

    expect(data.peers).toHaveLength(1);
    expect(data.peers[0]!.name).toBe('worker-a');
    expect(data.peers[0]!.health).toBe('healthy');
    expect(data.peers[0]!.latency).toBe('20ms');
    expect(data.peers[0]!.load).toBe('idle');
    expect(data.peers[0]!.tasks.map(t => t.message)).toEqual(['run the tests', 'lint']);
    expect(data.totals).toMatchObject({ peers: 1, tasks: 2, pending: 1, done: 1, rejected: 0, healthy: 1 });
  });

  test('matches tasks to a peer by display name after a rename', () => {
    const store = makeStore();
    store.addConnection(peer());
    store.setPeerName('peer-a', 'builder');
    store.addTodo(todo({ fromName: 'builder' }));

    const data = collectPeerDashboard(store, NOW);

    expect(data.peers[0]!.name).toBe('builder');
    expect(data.peers[0]!.tasks).toHaveLength(1);
    expect(data.unassigned).toEqual([]);
  });

  test('keeps tasks from disconnected peers instead of dropping them', () => {
    const store = makeStore();
    store.addConnection(peer());
    store.addTodo(todo({ id: 'todo-ghost-01', from: 'peer-z', fromName: 'ghost' }));

    const data = collectPeerDashboard(store, NOW);

    expect(data.peers[0]!.tasks).toEqual([]);
    expect(data.unassigned.map(t => t.id)).toEqual(['todo-ghost-01']);
    expect(data.totals.tasks).toBe(1);
  });

  test('attaches broker replies to the task they answer', () => {
    const store = makeStore();
    store.addConnection(peer());
    store.addTodo(todo());
    store.addToOutbox(reply('todo-0001-aaaa', 'all green'));

    const data = collectPeerDashboard(store, NOW);
    expect(data.peers[0]!.tasks[0]!.result).toBe('all green');
  });

  test('ignores peers that are not reachable (port 0)', () => {
    const store = makeStore();
    store.addConnection(peer({ port: 0 }));
    expect(collectPeerDashboard(store, NOW).peers).toEqual([]);
  });
});

describe('formatPeerTaskDashboard', () => {
  test('renders peers, health, tasks, and results', () => {
    const store = makeStore();
    store.addConnection(peer());
    store.addTodo(todo());
    store.addToOutbox(reply('todo-0001-aaaa', 'all green'));

    const text = formatPeerTaskDashboard(store, NOW);

    expect(text).toContain('Peer Task Dashboard');
    expect(text).toContain('worker-a');
    expect(text).toContain('healthy · 20ms · idle');
    expect(text).toContain('run the tests [pending]');
    expect(text).toContain('all green');
    expect(text).toContain('1 task total · 0 done · 1 pending');
  });

  test('calls out tasks from peers that are gone', () => {
    const store = makeStore();
    store.addConnection(peer());
    store.addTodo(todo({ id: 'todo-ghost-01', from: 'peer-z', fromName: 'ghost' }));
    expect(formatPeerTaskDashboard(store, NOW)).toContain('Unassigned');
  });
});

describe('formatPeerTaskSummary', () => {
  test('is a one-line count', () => {
    const store = makeStore();
    store.addConnection(peer());
    store.addTodo(todo());
    store.addTodo(todo({ id: 'todo-0002-bbbb', status: 'done' }));
    expect(formatPeerTaskSummary(store)).toBe('[Peers: 1 · Tasks: 1/2 done · 1 pending]');
  });
});

describe('formatPeerHealth', () => {
  test('tells the user how to connect when there are no peers', () => {
    expect(formatPeerHealth(makeStore())).toContain('No connected peers');
  });

  test('renders a health table', () => {
    const store = makeStore();
    store.addConnection(peer());
    store.setPeerRole('peer-a', 'builder');

    const text = formatPeerHealth(store, NOW);
    expect(text).toContain('1 healthy');
    expect(text).toContain('worker-a');
    expect(text).toContain('builder');
    expect(text).toContain('10.0.0.2:4200');
  });
});
