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

  test('close stops advertising', () => {
    discovery = new PeerDiscovery();
    discovery.close();
    expect(discovery.isSharing).toBeFalse();
  });

  test('getGlobalDiscovery singleton', () => {
    expect(getGlobalDiscovery()).toBe(getGlobalDiscovery());
  });
});
