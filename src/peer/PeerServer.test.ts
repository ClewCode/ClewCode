import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { getGlobalPeerServer, PeerServer } from './PeerServer.js';

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
    const s = new PeerServer({ onMessage: () => {} });
    expect(s).toBeInstanceOf(PeerServer);
    s.stop();
  });

  test('getGlobalPeerServer singleton', () => {
    expect(getGlobalPeerServer()).toBe(getGlobalPeerServer());
  });

  test('setCallbacks merges', () => {
    server.setCallbacks({ onMessage: () => {} });
    server.setCallbacks({ onTodo: () => {} });
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
