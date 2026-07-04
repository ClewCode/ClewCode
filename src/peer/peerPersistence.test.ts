import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  loadPeerState,
  loadPeerTasks,
  MAX_PERSISTED_MESSAGES,
  MAX_PERSISTED_TASKS,
  MAX_PERSISTED_TODOS,
  type PersistedPeerState,
  type PersistedSwarmTasks,
  savePeerState,
  savePeerTasksState,
} from './peerPersistence.js';
import type { MeshChatMessage, MeshTodo, PeerInfo, SwarmTask } from './types.js';

function makePeer(id: string): PeerInfo {
  return {
    id,
    hostname: `host-${id}`,
    ip: '192.168.1.10',
    port: 41234,
    cwd: '/projects/demo',
    version: '0.4.5',
    lastSeen: 1000,
    status: 'online',
  };
}

function makeMessage(i: number): MeshChatMessage {
  return {
    id: `msg_${i}`,
    from: 'peer-a',
    fromName: 'host-a',
    text: `hello ${i}`,
    color: 'cyan',
    timestamp: i,
  };
}

function makeTodo(i: number): MeshTodo {
  return {
    id: `todo_${i}`,
    from: 'peer-a',
    fromName: 'host-a',
    message: `task ${i}`,
    createdAt: i,
    status: 'pending',
  } as MeshTodo;
}

function makeSwarmTask(i: number, overrides?: Partial<SwarmTask>): SwarmTask {
  return {
    id: `task_${i}`,
    command: `echo ${i}`,
    from: 'peer-a',
    fromName: 'host-a',
    status: 'queued',
    priority: 'normal',
    createdAt: i,
    ...overrides,
  };
}

describe('peerPersistence', () => {
  let dir: string;
  let statePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'peer-persist-'));
    statePath = join(dir, 'state.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('round-trips connections, messages, todos, and tags', async () => {
    const state: PersistedPeerState = {
      version: 1,
      connections: [makePeer('a'), makePeer('b')],
      messages: [makeMessage(1), makeMessage(2)],
      todos: [makeTodo(1)],
      swarmTags: { a: { displayName: 'Builder', role: 'builder' } },
    };
    await savePeerState(state, statePath);

    const loaded = loadPeerState(statePath);
    expect(loaded).not.toBeNull();
    expect(loaded!.connections.map(p => p.id)).toEqual(['a', 'b']);
    expect(loaded!.messages).toHaveLength(2);
    expect(loaded!.todos[0]!.message).toBe('task 1');
    expect(loaded!.swarmTags.a).toEqual({ displayName: 'Builder', role: 'builder' });
  });

  it('caps persisted messages and todos, keeping the newest', async () => {
    const state: PersistedPeerState = {
      version: 1,
      connections: [],
      messages: Array.from({ length: MAX_PERSISTED_MESSAGES + 50 }, (_, i) => makeMessage(i)),
      todos: Array.from({ length: MAX_PERSISTED_TODOS + 10 }, (_, i) => makeTodo(i)),
      swarmTags: {},
    };
    await savePeerState(state, statePath);

    const loaded = loadPeerState(statePath);
    expect(loaded!.messages).toHaveLength(MAX_PERSISTED_MESSAGES);
    expect(loaded!.messages[0]!.id).toBe('msg_50');
    expect(loaded!.todos).toHaveLength(MAX_PERSISTED_TODOS);
    expect(loaded!.todos.at(-1)!.id).toBe(`todo_${MAX_PERSISTED_TODOS + 9}`);
  });

  it('returns null for missing or corrupt state files', async () => {
    expect(loadPeerState(join(dir, 'nope.json'))).toBeNull();

    const { writeFile } = await import('node:fs/promises');
    await writeFile(statePath, '{not json', 'utf-8');
    expect(loadPeerState(statePath)).toBeNull();

    await writeFile(statePath, JSON.stringify({ version: 99 }), 'utf-8');
    expect(loadPeerState(statePath)).toBeNull();
  });
});

describe('peerPersistence — swarm tasks', () => {
  let dir: string;
  let tasksPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'peer-persist-tasks-'));
    tasksPath = join(dir, 'tasks.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('round-trips queued and terminal tasks, including dependsOn', async () => {
    const state: PersistedSwarmTasks = {
      version: 1,
      tasks: [
        makeSwarmTask(1, { status: 'completed', result: { stdout: 'ok', stderr: '', exitCode: 0 } }),
        makeSwarmTask(2, { dependsOn: ['task_1'] }),
      ],
    };
    await savePeerTasksState(state, tasksPath);

    const loaded = loadPeerTasks(tasksPath);
    expect(loaded).not.toBeNull();
    expect(loaded!.tasks).toHaveLength(2);
    expect(loaded!.tasks[0]!.status).toBe('completed');
    expect(loaded!.tasks[1]!.dependsOn).toEqual(['task_1']);
  });

  it('caps persisted tasks, keeping the newest', async () => {
    const state: PersistedSwarmTasks = {
      version: 1,
      tasks: Array.from({ length: MAX_PERSISTED_TASKS + 25 }, (_, i) => makeSwarmTask(i)),
    };
    await savePeerTasksState(state, tasksPath);

    const loaded = loadPeerTasks(tasksPath);
    expect(loaded!.tasks).toHaveLength(MAX_PERSISTED_TASKS);
    expect(loaded!.tasks[0]!.id).toBe('task_25');
    expect(loaded!.tasks.at(-1)!.id).toBe(`task_${MAX_PERSISTED_TASKS + 24}`);
  });

  it('returns null for missing or corrupt task files', async () => {
    expect(loadPeerTasks(join(dir, 'nope.json'))).toBeNull();

    const { writeFile } = await import('node:fs/promises');
    await writeFile(tasksPath, '{not json', 'utf-8');
    expect(loadPeerTasks(tasksPath)).toBeNull();

    await writeFile(tasksPath, JSON.stringify({ version: 99 }), 'utf-8');
    expect(loadPeerTasks(tasksPath)).toBeNull();
  });
});
