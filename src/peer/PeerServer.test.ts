import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { getGlobalPeerServer, PeerServer } from './PeerServer.js';

const noop = () => undefined;

function mi(o) {
  return {
    id: 'tp',
    hostname: 'th',
    ip: '127.0.0.1',
    port: 0,
    cwd: '/r',
    version: 't',
    lastSeen: Date.now(),
    status: 'online',
    ...o,
  };
}

describe('PeerServer', () => {
  let server;
  beforeEach(() => {
    server = new PeerServer();
  });
  afterEach(() => {
    server.stop();
  });

  test('constructor creates instance', () => {
    expect(server).toBeInstanceOf(PeerServer);
    expect(server.port).toBe(0);
  });

  test('constructor accepts callbacks', () => {
    const s = new PeerServer({ onMessage: noop });
    expect(s).toBeInstanceOf(PeerServer);
    s.stop();
  });

  test('getGlobalPeerServer singleton', () => {
    expect(getGlobalPeerServer()).toBe(getGlobalPeerServer());
  });

  test('setCallbacks merges', () => {
    server.setCallbacks({ onMessage: noop });
    server.setCallbacks({ onTodo: noop });
    expect(server).toBeInstanceOf(PeerServer);
  });

  test('isBusy/queueDepth initially false/0', () => {
    expect(server.isBusy).toBeFalse();
    expect(server.queueDepth).toBe(0);
  });

  test('getTodos empty, updateTodoStatus false for unknown', () => {
    expect(server.getTodos()).toEqual([]);
    expect(server.updateTodoStatus('x', 'done')).toBeFalse();
  });

  test('start returns port', async () => {
    const port = await server.start(mi());
    expect(typeof port).toBe('number');
    expect(port).toBeGreaterThan(0);
    expect(server.port).toBe(port);
  });

  test('start idempotent', async () => {
    const p1 = await server.start(mi());
    const p2 = await server.start(mi());
    expect(p1).toBe(p2);
  });

  test('stop does not throw', () => {
    expect(() => server.stop()).not.toThrow();
  });

  test('start-stop-start works', async () => {
    await server.start(mi());
    server.stop();
    const p = await server.start(mi());
    expect(p).toBeGreaterThan(0);
  });

  test('GET /peer-info', async () => {
    const port = await server.start(mi({ id: 'info-test' }));
    const r = await fetch(`http://127.0.0.1:${port}/peer-info`);
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.id).toBe('info-test');
    expect(d.isBusy).toBeFalse();
    expect(d.cwd).toBeUndefined();
  });

  test('POST /peer-msg fires callback', async () => {
    let m = null;
    server.setCallbacks({
      onMessage: msg => {
        m = msg;
      },
    });
    const port = await server.start(mi());
    const token = server.token;
    const r = await fetch(`http://127.0.0.1:${port}/peer-msg`, {
      method: 'POST',
      body: JSON.stringify({ from: 'p2', text: 'hello', token }),
    });
    expect(r.status).toBe(200);
    expect((await r.json()).ok).toBeTrue();
    expect(m.from).toBe('p2');
  });

  test('POST /peer-msg chunk info', async () => {
    let m = null;
    server.setCallbacks({
      onMessage: msg => {
        m = msg;
      },
    });
    const port = await server.start(mi());
    const token = server.token;
    await fetch(`http://127.0.0.1:${port}/peer-msg`, {
      method: 'POST',
      body: JSON.stringify({ from: 'p2', chunkGroup: 'g1', chunkIndex: 0, token }),
    });
    expect(m.chunkGroup).toBe('g1');
  });

  test('POST /peer-msg defaults', async () => {
    let m = null;
    server.setCallbacks({
      onMessage: msg => {
        m = msg;
      },
    });
    const port = await server.start(mi());
    const token = server.token;
    await fetch(`http://127.0.0.1:${port}/peer-msg`, { method: 'POST', body: JSON.stringify({ token }) });
    expect(m.from).toBe('unknown');
  });

  test('POST /peer-todo fires callback and returns ok', async () => {
    let t = null;
    server.setCallbacks({
      onTodo: todo => {
        t = todo;
      },
    });
    const port = await server.start(mi());
    const token = server.token;
    const r = await fetch(`http://127.0.0.1:${port}/peer-todo`, {
      method: 'POST',
      body: JSON.stringify({ from: 'p2', fromName: 'P2', message: 'do it', token }),
    });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.ok).toBeTrue();
    expect(t.message).toBe('do it');
    expect(t.from).toBe('p2');
  });

  test('POST /peer-exec without onExec returns 501', async () => {
    const port = await server.start(mi());
    const token = server.token;
    const r = await fetch(`http://127.0.0.1:${port}/peer-exec`, {
      method: 'POST',
      body: JSON.stringify({ command: 'echo x', from: 't', token }),
    });
    expect(r.status).toBe(501);
  });

  test('POST /peer-exec with onExec runs command', async () => {
    let cmd = '';
    server.setCallbacks({
      onExec: async c => {
        cmd = c;
        return { stdout: c, stderr: '', exitCode: 0 };
      },
    });
    const port = await server.start(mi());
    const token = server.token;
    const r = await fetch(`http://127.0.0.1:${port}/peer-exec`, {
      method: 'POST',
      body: JSON.stringify({ command: 'echo hi', from: 't', fromName: 'T', token }),
    });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.running).toBeTrue();
    expect(cmd).toBe('echo hi');
  });

  test('GET /peer-queue-status returns default state', async () => {
    const port = await server.start(mi());
    const r = await fetch(`http://127.0.0.1:${port}/peer-queue-status`);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.isBusy).toBeFalse();
    expect(body.queueDepth).toBe(0);
  });

  test('GET /peer-queue-status redacts command from public response', async () => {
    let release: (v?: unknown) => void;
    server.setCallbacks({
      onExec: async c => {
        if (c === 'slow-secret') {
          await new Promise(resolve => {
            release = resolve;
          });
        }
        return { stdout: c, stderr: '', exitCode: 0 };
      },
    });
    const port = await server.start(mi());
    const token = server.token;
    const running = fetch(`http://127.0.0.1:${port}/peer-exec`, {
      method: 'POST',
      body: JSON.stringify({ command: 'slow-secret', from: 't', token }),
    });
    await new Promise(r => setTimeout(r, 50));
    await fetch(`http://127.0.0.1:${port}/peer-exec`, {
      method: 'POST',
      body: JSON.stringify({ command: 'queued-secret', from: 't', token }),
    });

    const r = await fetch(`http://127.0.0.1:${port}/peer-queue-status`);
    const body = await r.json();
    expect(JSON.stringify(body)).not.toContain('slow-secret');
    expect(JSON.stringify(body)).not.toContain('queued-secret');
    expect(body.currentTask.command).toBeUndefined();
    expect(body.queue[0].command).toBeUndefined();

    release!();
    await running;
  });

  test('POST /peer-queue-cancel returns 404 for unknown task', async () => {
    const port = await server.start(mi());
    const token = server.token;
    const r = await fetch(`http://127.0.0.1:${port}/peer-queue-cancel`, {
      method: 'POST',
      body: JSON.stringify({ id: 'nope', token }),
    });
    expect(r.status).toBe(404);
  });

  test('POST /peer-queue-cancel-all clears empty queue', async () => {
    const port = await server.start(mi());
    const token = server.token;
    const r = await fetch(`http://127.0.0.1:${port}/peer-queue-cancel-all`, {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.ok).toBeTrue();
    expect(body.cancelled).toBe(0);
  });

  test('GET /peer-events returns SSE content-type', async () => {
    const port = await server.start(mi());
    const token = server.token;
    const r = await fetch(`http://127.0.0.1:${port}/peer-events?token=${token}`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('text/event-stream');
    r.body?.cancel();
  });

  test('GET /peer-events rejects invalid same-length token', async () => {
    const port = await server.start(mi());
    const badToken = '0'.repeat(server.token.length);
    const r = await fetch(`http://127.0.0.1:${port}/peer-events?token=${badToken}`);
    expect(r.status).toBe(401);
  });

  test('GET /peer-events only allows localhost CORS origins', async () => {
    const port = await server.start(mi());
    const token = server.token;
    const bad = await fetch(`http://127.0.0.1:${port}/peer-events?token=${token}`, {
      headers: { Origin: 'https://evil.example' },
    });
    expect(bad.headers.get('access-control-allow-origin')).toBeNull();
    bad.body?.cancel();

    const good = await fetch(`http://127.0.0.1:${port}/peer-events?token=${token}`, {
      headers: { Origin: 'http://localhost:3000' },
    });
    expect(good.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
    good.body?.cancel();
  });

  test('GET /peer-events sends connected event', async () => {
    const port = await server.start(mi());
    const token = server.token;
    const r = await fetch(`http://127.0.0.1:${port}/peer-events?token=${token}`);
    const reader = r.body!.getReader();
    const decoder = new TextDecoder();
    const { value } = await reader.read();
    expect(decoder.decode(value)).toContain('connected');
    reader.cancel();
  });

  test('GET unknown path returns 404', async () => {
    const port = await server.start(mi());
    const r = await fetch(`http://127.0.0.1:${port}/no-such-thing`);
    expect(r.status).toBe(404);
  });

  test('updatePeerInfo patches stored info', async () => {
    const port = await server.start(mi({ hostname: 'old' }));
    server.updatePeerInfo({ hostname: 'new-name' });
    const r = await fetch(`http://127.0.0.1:${port}/peer-info`);
    const body = await r.json();
    expect(body.hostname).toBe('new-name');
  });

  test('todo lifecycle — add via HTTP then update', async () => {
    const port = await server.start(mi());
    const token = server.token;
    await fetch(`http://127.0.0.1:${port}/peer-todo`, {
      method: 'POST',
      body: JSON.stringify({ from: 't', fromName: 'T', message: 'task', token }),
    });
    expect(server.getTodos()).toHaveLength(1);
    const id = server.getTodos()[0]!.id;
    expect(server.updateTodoStatus(id, 'done')).toBeTrue();
    expect(server.getTodos()[0]!.status).toBe('done');
  });

  test('isBusy reflects running exec', async () => {
    let resolve: (v: any) => void;
    server.setCallbacks({
      onExec: async () => {
        await new Promise(r => {
          resolve = r;
        });
        return { stdout: '', stderr: '', exitCode: 0 };
      },
    });
    const port = await server.start(mi());
    const token = server.token;
    const p = fetch(`http://127.0.0.1:${port}/peer-exec`, {
      method: 'POST',
      body: JSON.stringify({ command: 'slow', from: 't', fromName: 'T', token }),
    });
    await new Promise(r => setTimeout(r, 50));
    expect(server.isBusy).toBeTrue();
    resolve!({ stdout: '', stderr: '', exitCode: 0 });
    await p;
    await new Promise(r => setTimeout(r, 50));
    expect(server.isBusy).toBeFalse();
  });
});

describe('PeerServer — concurrency', () => {
  let server;
  afterEach(() => {
    server.stop();
  });

  test('maxConcurrentTasks lets N tasks run at once instead of queuing', async () => {
    server = new PeerServer(undefined, { maxConcurrentTasks: 2 });
    const releases: Array<(v: any) => void> = [];
    server.setCallbacks({
      onExec: async () =>
        new Promise(r => {
          releases.push(r);
        }),
    });
    const port = await server.start(mi());
    const token = server.token;

    const p1 = fetch(`http://127.0.0.1:${port}/peer-exec`, {
      method: 'POST',
      body: JSON.stringify({ command: 'a', from: 't', token }),
    });
    await new Promise(r => setTimeout(r, 30));
    const p2 = fetch(`http://127.0.0.1:${port}/peer-exec`, {
      method: 'POST',
      body: JSON.stringify({ command: 'b', from: 't', token }),
    });
    await new Promise(r => setTimeout(r, 30));

    // Both should be running concurrently (not one queued), since capacity is 2.
    expect(server.getTasks().running).toHaveLength(2);
    expect(server.queueDepth).toBe(0);
    expect(server.isBusy).toBeTrue();

    for (const rel of releases) rel({ stdout: '', stderr: '', exitCode: 0 });
    await Promise.all([p1, p2]);
  });

  test('a third task queues once at capacity', async () => {
    server = new PeerServer(undefined, { maxConcurrentTasks: 2 });
    const releases: Array<(v: any) => void> = [];
    server.setCallbacks({
      onExec: async () =>
        new Promise(r => {
          releases.push(r);
        }),
    });
    const port = await server.start(mi());
    const token = server.token;

    for (const cmd of ['a', 'b']) {
      void fetch(`http://127.0.0.1:${port}/peer-exec`, {
        method: 'POST',
        body: JSON.stringify({ command: cmd, from: 't', token }),
      });
      await new Promise(r => setTimeout(r, 20));
    }

    const r3 = await fetch(`http://127.0.0.1:${port}/peer-exec`, {
      method: 'POST',
      body: JSON.stringify({ command: 'c', from: 't', token }),
    });
    const body3 = await r3.json();
    expect(body3.queued).toBeTrue();
    expect(server.queueDepth).toBe(1);

    for (const rel of releases) rel({ stdout: '', stderr: '', exitCode: 0 });
  });
});

describe('PeerServer — task dependencies', () => {
  let server;
  afterEach(() => {
    server.stop();
  });

  test('a task with an unmet dependsOn stays queued even with free capacity', async () => {
    server = new PeerServer(undefined, { maxConcurrentTasks: 2 });
    const ranCommands: string[] = [];
    server.setCallbacks({
      onExec: async (cmd: string) => {
        ranCommands.push(cmd);
        return { stdout: '', stderr: '', exitCode: 0 };
      },
    });
    const port = await server.start(mi());
    const token = server.token;

    const r = await fetch(`http://127.0.0.1:${port}/peer-exec`, {
      method: 'POST',
      body: JSON.stringify({ command: 'dependent', from: 't', token, dependsOn: ['nonexistent-task'] }),
    });
    const body = await r.json();
    expect(body.queued).toBeTrue();
    // Give the (would-be) scheduler a moment; it must NOT have run.
    await new Promise(res => setTimeout(res, 30));
    expect(ranCommands).toEqual([]);
    expect(server.queueDepth).toBe(1);
  });

  test('a dependent task runs once its dependency completes', async () => {
    server = new PeerServer(undefined, { maxConcurrentTasks: 1 });
    const ranCommands: string[] = [];
    let releaseFirst: (v: any) => void;
    server.setCallbacks({
      onExec: async (cmd: string) => {
        ranCommands.push(cmd);
        if (cmd === 'first') {
          return new Promise(r => {
            releaseFirst = r;
          });
        }
        return { stdout: '', stderr: '', exitCode: 0 };
      },
    });
    const port = await server.start(mi());
    const token = server.token;

    // "first" runs immediately (capacity free).
    const p1 = fetch(`http://127.0.0.1:${port}/peer-exec`, {
      method: 'POST',
      body: JSON.stringify({ command: 'first', from: 't', token }),
    });
    await new Promise(r => setTimeout(r, 30));
    const firstId = server.getTasks().running[0]?.id;
    expect(firstId).toBeTruthy();

    // "second" depends on "first" — must queue even though nothing else is queued.
    const r2 = await fetch(`http://127.0.0.1:${port}/peer-exec`, {
      method: 'POST',
      body: JSON.stringify({ command: 'second', from: 't', token, dependsOn: [firstId] }),
    });
    expect((await r2.json()).queued).toBeTrue();
    expect(ranCommands).toEqual(['first']);

    // Completing "first" should unblock "second".
    releaseFirst!({ stdout: '', stderr: '', exitCode: 0 });
    await p1;
    await new Promise(r => setTimeout(r, 30));
    expect(ranCommands).toEqual(['first', 'second']);
  });
});
