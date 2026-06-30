import { afterEach, describe, expect, test } from 'bun:test';
import { getGlobalDiscovery, PeerDiscovery } from './PeerDiscovery.js';

describe('PeerDiscovery', () => {
  let discovery;

  afterEach(() => {
    if (discovery) discovery.close();
  });

  test('constructor generates localId', () => {
    discovery = new PeerDiscovery();
    expect(discovery.peerId).toBeTruthy();
    expect(discovery.peerId.split('-').length).toBeGreaterThanOrEqual(3);
  });

  test('constructor accepts callbacks', () => {
    let _c = false;
    discovery = new PeerDiscovery({
      onPeerDiscovered: () => {
        _c = true;
      },
    });
    expect(discovery).toBeDefined();
  });

  test('setLocalName updates hostname and ID', () => {
    discovery = new PeerDiscovery();
    const oid = discovery.peerId;
    discovery.setLocalName('custom');
    expect(discovery.hostname).toBe('custom');
    expect(discovery.peerId).not.toBe(oid);
    expect(discovery.peerId).toContain('custom');
  });

  test('startAdvertising then close', async () => {
    discovery = new PeerDiscovery();
    expect(discovery.isSharing).toBeFalse();
    await discovery.startAdvertising(9999, '/cwd');
    expect(discovery.isSharing).toBeTrue();
    const mid = discovery.peerId;
    expect(mid).toBeTruthy();
  });

  test('getPeers empty initially', () => {
    discovery = new PeerDiscovery();
    expect(discovery.getPeers()).toEqual([]);
  });

  test('getPeer undefined for unknown', () => {
    discovery = new PeerDiscovery();
    expect(discovery.getPeer('nobody')).toBeUndefined();
  });

  test('UDP messages strip auth token before sending', () => {
    discovery = new PeerDiscovery();
    let sent = '';
    discovery.socket = {
      send: (buf: Buffer) => {
        sent = buf.toString();
      },
    };

    discovery.sendUdpMessage({ type: 'clew-peer-info', token: 'secret-token', id: 'peer-a' });

    expect(sent).toContain('peer-a');
    expect(sent).not.toContain('secret-token');
    expect(JSON.parse(sent).token).toBeUndefined();
  });

  test('UDP peer-info token is ignored on receive', () => {
    discovery = new PeerDiscovery();
    discovery.handleMessage(
      Buffer.from(
        JSON.stringify({
          type: 'clew-peer-info',
          version: 1,
          id: 'remote-peer',
          hostname: 'remote',
          ip: '127.0.0.2',
          port: 1234,
          cwd: '/remote',
          appVersion: 'test',
          status: 'online',
          token: 'leaked-token',
        }),
      ),
      { address: '127.0.0.2', port: 42069 } as any,
    );

    expect(discovery.getPeer('remote-peer')).toBeDefined();
    expect(discovery.getPeerToken('remote-peer')).toBeUndefined();
  });

  test('close stops advertising', () => {
    discovery = new PeerDiscovery();
    discovery.close();
    expect(discovery.isSharing).toBeFalse();
  });

  test('getGlobalDiscovery singleton', () => {
    expect(getGlobalDiscovery()).toBe(getGlobalDiscovery());
  });
});
