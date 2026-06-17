import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { PeerStore } from './PeerStore.js';

function mp(o) {
  return {
    id: 'peer-1',
    hostname: 'w',
    ip: '127.0.0.1',
    port: 4200,
    cwd: '/r',
    version: 't',
    lastSeen: Date.now(),
    status: 'online',
    ...o,
  };
}
function mm(o) {
  return { id: 'msg-1', from: 'peer-1', fromName: 'w', text: 'hello', color: 'cyan', timestamp: Date.now(), ...o };
}
function mt(o) {
  return { id: 'todo-1', from: 'peer-1', fromName: 'w', message: 'do', createdAt: Date.now(), status: 'pending', ...o };
}

describe('PeerStore', () => {
  let store;
  beforeEach(() => {
    store = new PeerStore();
  });
  afterEach(() => {
    store.destroy();
  });

  test('addPeer/getPeers', () => {
    store.addPeer(mp());
    expect(store.getPeers()).toHaveLength(1);
  });

  test('addPeer updates existing', () => {
    store.addPeer(mp());
    store.addPeer(mp({ cwd: '/x' }));
    expect(store.getPeers()[0].cwd).toBe('/x');
  });

  test('getPeer', () => {
    store.addPeer(mp());
    expect(store.getPeer('peer-1')).toBeDefined();
    expect(store.getPeer('nope')).toBeUndefined();
  });

  test('findPeer by id/hostname/displayName', () => {
    store.addPeer(mp({ id: 'abc', hostname: 'alpha' }));
    store.setPeerName('abc', 'Builder');
    expect(store.findPeer('abc')?.id).toBe('abc');
    expect(store.findPeer('alpha')?.id).toBe('abc');
    expect(store.findPeer('Builder')?.id).toBe('abc');
  });

  test('addPeer alias', () => {
    store.addPeer(mp({ id: 'x' }));
    expect(store.getPeer('x')).toBeDefined();
  });

  test('removePeer fires callback', () => {
    let rid = '';
    const s = new PeerStore({
      onPeerRemoved: i => {
        rid = i;
      },
    });
    s.addPeer(mp());
    s.removePeer('peer-1');
    expect(rid).toBe('peer-1');
    s.destroy();
  });

  test('addConnection', () => {
    store.addConnection(mp({ id: 'c' }));
    expect(store.getConnections()).toHaveLength(1);
  });

  test('addMessage/getMessages/clear/createMessage', () => {
    store.addMessage(mm());
    expect(store.getMessages()).toHaveLength(1);
    store.clearMessages();
    expect(store.getMessages()).toHaveLength(0);
    const m = store.createMessage('tp', 'T', 'hi');
    expect(m.from).toBe('tp');
    expect(m.text).toBe('hi');
  });

  test('getMessagesAfter', () => {
    store.addMessage(mm({ id: 'm1', timestamp: 100 }));
    store.addMessage(mm({ id: 'm2', timestamp: 200 }));
    expect(store.getMessagesAfter(150)).toHaveLength(1);
  });

  test('getReassembledMessages', () => {
    store.addMessage(mm({ id: 'c1', text: 'A', chunkGroup: 'g', chunkIndex: 0, chunkTotal: 2 }));
    store.addMessage(mm({ id: 'c2', text: 'B', chunkGroup: 'g', chunkIndex: 1, chunkTotal: 2 }));
    const r = store.getReassembledMessages();
    expect(r).toHaveLength(1);
    expect(r[0].text).toBe('AB');
  });

  test('getChunkGroupStatus', () => {
    expect(store.getChunkGroupStatus('n')).toBeNull();
    store.addMessage(mm({ chunkGroup: 'g', chunkIndex: 0, chunkTotal: 3 }));
    store.addMessage(mm({ chunkGroup: 'g', chunkIndex: 2, chunkTotal: 3 }));
    expect(store.getChunkGroupStatus('g').received).toBe(2);
  });

  test('waitForNewMessage', async () => {
    const a = Date.now();
    const p = store.waitForNewMessage(a, 500);
    store.addMessage(mm({ timestamp: Date.now() + 5 }));
    expect(await p).toHaveLength(1);
  });

  test('waitForNewMessage timeout', async () => {
    const msgs = await store.waitForNewMessage(Date.now(), 50);
    expect(msgs).toHaveLength(0);
  }, 2000);

  test('waitForMessageFrom', async () => {
    const a = Date.now();
    const p = store.waitForMessageFrom(a, 500, 'exp');
    store.addMessage(mm({ id: 'w', from: 'wrong', timestamp: Date.now() + 5 }));
    await new Promise(r => setTimeout(r, 50));
    store.addMessage(mm({ id: 'r', from: 'exp', timestamp: Date.now() + 20 }));
    expect(await p).toHaveLength(1);
  });

  test('addTodo/updateTodoStatus', () => {
    store.addTodo(mt());
    expect(store.getTodos()).toHaveLength(1);
    expect(store.updateTodoStatus('todo-1', 'done')).toBeTrue();
    expect(store.getTodos()[0].status).toBe('done');
    expect(store.updateTodoStatus('n', 'done')).toBeFalse();
  });

  test('peer tags and resolve', () => {
    store.setPeerName('p1', 'N');
    store.setPeerRole('p1', 'R');
    expect(store.getPeerTags('p1')?.displayName).toBe('N');
    expect(store.getPeerTags('p1')?.role).toBe('R');
    const p = mp({ id: 'p1', hostname: 'h' });
    expect(store.resolveName(p)).toBe('N');
    expect(store.resolveRole(p)).toBe('R');
  });

  test('peer alias methods', () => {
    store.setPeerName('x', 'A');
    store.setPeerRole('x', 'B');
    expect(store.getPeerTags('x')?.displayName).toBe('A');
    expect(store.getAllPeerTags()).toHaveLength(1);
  });

  test('callbacks', () => {
    let a = false,
      r = false,
      u = false;
    const s = new PeerStore({
      onPeerAdded: () => {
        a = true;
      },
      onPeerUpdated: () => {
        u = true;
      },
      onPeerRemoved: () => {
        r = true;
      },
    });
    s.addPeer(mp());
    s.addPeer(mp({ status: 'off' }));
    s.removePeer('peer-1');
    expect(a).toBeTrue();
    expect(u).toBeTrue();
    expect(r).toBeTrue();
    s.destroy();
  });

  test('setCallbacks merges', () => {
    let a = false,
      m = false;
    const s = new PeerStore({
      onPeerAdded: () => {
        a = true;
      },
    });
    s.setCallbacks({
      onMessageReceived: () => {
        m = true;
      },
    });
    s.addPeer(mp());
    s.addMessage(mm());
    expect(a).toBeTrue();
    expect(m).toBeTrue();
    s.destroy();
  });

  test('alias getters', () => {
    store.addPeer(mp({ port: 7777 }));
    expect(store.getMeshs()).toHaveLength(1);
    expect(store.getPeerByPort(7777)).toBeDefined();
    expect(store.findPeer('w')?.id).toBe('peer-1');
  });

  test('size', () => {
    expect(store.size).toBe(0);
    store.addPeer(mp({ id: 'p1' }));
    expect(store.size).toBe(1);
  });

  test('destroy', () => {
    store.addPeer(mp());
    store.addMessage(mm());
    store.addTodo(mt());
    store.destroy();
    expect(store.getPeers()).toHaveLength(0);
    expect(store.getMessages()).toHaveLength(0);
    expect(store.getTodos()).toHaveLength(0);
  });

  test('singleton', async () => {
    const { getGlobalPeerStore } = await import('./PeerStore.js');
    expect(getGlobalPeerStore()).toBe(getGlobalPeerStore());
  });
});
