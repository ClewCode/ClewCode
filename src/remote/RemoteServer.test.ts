import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { RemoteServer } from './RemoteServer.js';
import { consumeToken, generateToken } from './tokenStore.js';

describe('RemoteServer', () => {
  let server: RemoteServer;
  let token: string;

  beforeAll(async () => {
    const result = generateToken('test');
    token = result.raw;
    server = new RemoteServer({
      host: '127.0.0.1',
      port: 0,
      authToken: token,
      maxSessions: 8,
      idleTimeoutMs: 60000,
    });
    const addr = await server.start();
    // @ts-expect-error: store for cleanup
    globalThis.__testPort = addr.port;
  });

  afterAll(async () => {
    await server.stop();
  });

  test('starts and responds to health check', async () => {
    const res = await fetch(`http://127.0.0.1:${(globalThis as any).__testPort}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  test('rejects session creation without auth', async () => {
    const res = await fetch(`http://127.0.0.1:${(globalThis as any).__testPort}/v1/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });

  test('creates session with valid token', async () => {
    const res = await fetch(`http://127.0.0.1:${(globalThis as any).__testPort}/v1/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ cwd: '/tmp' }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.session_id).toBeDefined();
    expect(data.ws_url).toContain('ws://');
  });
});

describe('tokenStore', () => {
  test('generates and consumes a token', () => {
    const { raw, entry } = generateToken('test-token');
    expect(raw).toMatch(/^clew-rt-/);
    expect(entry.label).toBe('test-token');
    expect(entry.consumedAt).toBeNull();

    const consumed = consumeToken(raw);
    expect(consumed).not.toBeNull();
    expect(consumed!.consumedAt).not.toBeNull();

    // Second use should fail
    const again = consumeToken(raw);
    expect(again).toBeNull();
  });

  test('rejects invalid token prefix', () => {
    const result = consumeToken('invalid-token');
    expect(result).toBeNull();
  });
});
