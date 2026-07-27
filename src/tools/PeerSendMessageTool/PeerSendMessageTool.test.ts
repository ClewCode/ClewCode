import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

const peer = {
  id: 'peer-1',
  hostname: 'worker',
  ip: '127.0.0.1',
  port: 43123,
  cwd: '/repo',
  version: 'test',
  lastSeen: Date.now(),
  status: 'online' as const,
};

const addedMessages: unknown[] = [];
const waitForMessageFrom = mock(async () => []);
const store = {
  getPeerByPort: () => undefined,
  findPeer: (query: string) => (query === peer.hostname ? peer : undefined),
  getPeerTags: () => undefined,
  getPeerToken: () => 'target-token',
  addMessage: (message: unknown) => addedMessages.push(message),
  waitForMessageFrom,
};
const discovery = {
  isSharing: true,
  hostname: 'sender',
  peerId: 'sender-1',
  getPeerToken: () => undefined,
};
const server = { port: 43124 };

mock.module('../../peer/PeerDiscovery.js', () => ({ getGlobalDiscovery: () => discovery }));
mock.module('../../peer/PeerServer.js', () => ({ getGlobalPeerServer: () => server }));
mock.module('../../peer/PeerStore.js', () => ({ getGlobalPeerStore: () => store }));

const { PeerSendMessageTool } = await import('./PeerSendMessageTool.js');
const realFetch = globalThis.fetch;

beforeEach(() => {
  addedMessages.length = 0;
  waitForMessageFrom.mockClear();
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('PeerSendMessageTool', () => {
  test.each([undefined, false])('uses direct delivery when useBroker is %s', async useBroker => {
    const urls: string[] = [];
    globalThis.fetch = mock(async (url: string | URL | Request) => {
      urls.push(String(url));
      return Response.json({ ok: true, id: 'direct-1' });
    }) as unknown as typeof fetch;

    const result = await PeerSendMessageTool.call({
      peer: peer.hostname,
      message: 'hello',
      waitResponse: true,
      responseTimeout: 1,
      useBroker,
    });

    expect(result.data.success).toBe(true);
    expect(urls).toEqual([`http://${peer.ip}:${peer.port}/peer-msg`]);
    expect(waitForMessageFrom).toHaveBeenCalledTimes(1);
  });

  test('uses broker delivery and correlated reply polling', async () => {
    const requests: Array<{ url: string; body?: Record<string, unknown> }> = [];
    globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
      const request = { url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined };
      requests.push(request);
      if (request.url.endsWith('/broker/send')) return Response.json({ ok: true, id: 'broker-1' });
      return Response.json({
        messages: [
          {
            id: 'reply-1',
            from: peer.hostname,
            fromName: 'Worker',
            to: 'sender',
            text: 'done',
            replyTo: 'broker-1',
            timestamp: 123,
            delivered: false,
          },
        ],
      });
    }) as unknown as typeof fetch;

    const result = await PeerSendMessageTool.call({
      peer: peer.hostname,
      message: 'hello',
      waitResponse: true,
      responseTimeout: 1,
      useBroker: true,
    });

    expect(requests[0]).toEqual({
      url: `http://${peer.ip}:${peer.port}/broker/send`,
      body: expect.objectContaining({ text: 'hello', to: peer.hostname, token: 'target-token' }),
    });
    expect(requests[1]?.url).toContain(`http://${peer.ip}:${peer.port}/broker/recv?`);
    expect(requests[1]?.url).toContain('replyTo=broker-1');
    expect(result.data.response?.text).toBe('done');
    expect(waitForMessageFrom).not.toHaveBeenCalled();
  });

  test('sends one broker message when chunking is requested', async () => {
    const requests: Array<{ url: string; body?: Record<string, unknown> }> = [];
    globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return Response.json({ ok: true, id: 'broker-chunk' });
    }) as unknown as typeof fetch;

    const message = 'x'.repeat(250);
    const result = await PeerSendMessageTool.call({
      peer: peer.hostname,
      message,
      waitResponse: false,
      chunk: true,
      chunkSize: 100,
      useBroker: true,
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe(`http://${peer.ip}:${peer.port}/broker/send`);
    expect(requests[0]?.body?.text).toBe(message);
    expect(result.data.chunksSent).toBeUndefined();
  });

  test('does not fall back to direct delivery when broker send fails', async () => {
    const urls: string[] = [];
    globalThis.fetch = mock(async (url: string | URL | Request) => {
      urls.push(String(url));
      return new Response('', { status: 503 });
    }) as unknown as typeof fetch;

    const result = await PeerSendMessageTool.call({
      peer: peer.hostname,
      message: 'hello',
      waitResponse: false,
      useBroker: true,
    });

    expect(result.data.success).toBe(false);
    expect(urls).toEqual([`http://${peer.ip}:${peer.port}/broker/send`]);
  });

  test('reports a broker reply timeout', async () => {
    globalThis.fetch = mock(async (url: string | URL | Request) => {
      if (String(url).endsWith('/broker/send')) return Response.json({ ok: true, id: 'broker-2' });
      return Response.json({ messages: [] });
    }) as unknown as typeof fetch;

    const result = await PeerSendMessageTool.call({
      peer: peer.hostname,
      message: 'hello',
      waitResponse: true,
      responseTimeout: 1,
      useBroker: true,
    });

    expect(result.data.success).toBe(true);
    expect(result.data.timedOut).toBe(true);
  });
});
