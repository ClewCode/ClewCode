/**
 * PeerStore — In-memory registry of discovered peers with auto-eviction.
 *
 * - Add/update peers as they're discovered via UDP
 * - Remove stale peers (no heartbeat for PEER_STALE_TIMEOUT)
 * - Query by ID or list all
 */

import { logForDebugging } from '../utils/debug.js';
import { PEER_STALE_TIMEOUT, type PeerChatMessage, type PeerInfo, type PeerTodo, peerColorFromId } from './types.js';

export type PeerStoreCallbacks = {
  onPeerAdded?: (peer: PeerInfo) => void;
  onPeerUpdated?: (peer: PeerInfo) => void;
  onPeerRemoved?: (peerId: string) => void;
  onMessageReceived?: (msg: PeerChatMessage) => void;
  onTodoReceived?: (todo: PeerTodo) => void;
};

export type PeerTags = {
  displayName?: string;
  role?: string;
};

export class PeerStore {
  /** Discovered peers (auto-cleaned) */
  private peers = new Map<string, PeerInfo>();
  /** Explicitly joined peers (persistent, never cleaned) */
  private connections = new Map<string, PeerInfo>();
  private messages: PeerChatMessage[] = [];
  private todos: PeerTodo[] = [];
  private peerTags = new Map<string, PeerTags>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private callbacks: PeerStoreCallbacks;
  /** Resolve functions waiting for new messages, keyed by a unique ID */
  private messageWaiters = new Map<
    string,
    { resolve: (msgs: PeerChatMessage[]) => void; after: number; from?: string }
  >();

  constructor(callbacks?: PeerStoreCallbacks) {
    this.callbacks = callbacks ?? {};
    // Start stale peer cleanup
    this.cleanupTimer = setInterval(() => this.cleanup(), 30_000);
  }

  /** Update callbacks after creation (e.g., to wire up SSE events). */
  setCallbacks(callbacks: PeerStoreCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * Add a peer that was explicitly joined (persistent, never auto-cleaned).
   */
  addConnection(peer: PeerInfo): void {
    this.connections.set(peer.id, { ...peer });
    this.peerTags.set(peer.id, this.peerTags.get(peer.id) ?? {});
    this.callbacks.onPeerAdded?.(peer);
    logForDebugging(`[PeerStore] New connection: ${peer.hostname} (${peer.ip}:${peer.port})`);
  }

  /**
   * Add or update a discovered peer.
   */
  addPeer(peer: PeerInfo): void {
    const existing = this.peers.get(peer.id);
    if (existing) {
      existing.lastSeen = peer.lastSeen;
      existing.status = peer.status;
      existing.cwd = peer.cwd || existing.cwd;
      existing.sessionId = peer.sessionId || existing.sessionId;
      this.callbacks.onPeerUpdated?.(existing);
    } else {
      this.peers.set(peer.id, { ...peer });
      this.callbacks.onPeerAdded?.(peer);
      logForDebugging(`[PeerStore] New peer: ${peer.hostname} (${peer.ip}:${peer.port})`);
    }
  }

  /**
   * Remove a peer.
   */
  removePeer(id: string): void {
    this.peers.delete(id);
    this.callbacks.onPeerRemoved?.(id);
  }

  /**
   * Get all known peers (discovered + joined connections).
   */
  getPeers(): PeerInfo[] {
    const all = new Map(this.peers);
    for (const [id, peer] of this.connections) {
      all.set(id, peer);
    }
    return Array.from(all.values());
  }

  /** Get only explicitly joined connections. */
  getConnections(): PeerInfo[] {
    return Array.from(this.connections.values());
  }

  /**
   * Get a peer by ID (searches both discovered and connected).
   */
  getPeer(id: string): PeerInfo | undefined {
    return this.peers.get(id) ?? this.connections.get(id);
  }

  /**
   * Get peer by port (searches both discovered and connected).
   */
  getPeerByPort(port: number): PeerInfo | undefined {
    for (const peer of this.allPeers()) {
      if (peer.port === port) return peer;
    }
    return undefined;
  }

  /** Iterate all peers (discovered + connected) */
  private *allPeers(): Generator<PeerInfo> {
    yield* this.peers.values();
    yield* this.connections.values();
  }

  /**
   * Find a peer by hostname (partial match), display name, or id.
   */
  findPeer(query: string): PeerInfo | undefined {
    const q = query.toLowerCase();
    for (const peer of this.allPeers()) {
      if (peer.id.toLowerCase() === q || peer.hostname.toLowerCase() === q) return peer;
      const tags = this.peerTags.get(peer.id);
      const displayName = tags?.displayName?.toLowerCase();
      if (displayName === q) return peer;
    }
    for (const peer of this.allPeers()) {
      if (peer.id.toLowerCase().startsWith(q) || peer.hostname.toLowerCase().startsWith(q)) return peer;
      const tags = this.peerTags.get(peer.id);
      const displayName = tags?.displayName?.toLowerCase();
      if (displayName && displayName.startsWith(q)) return peer;
    }
    // Also search by ip:port format
    for (const peer of this.allPeers()) {
      const addr = `${peer.ip}:${peer.port}`;
      if (addr === q || addr.startsWith(q)) return peer;
    }
    return undefined;
  }

  /**
   * Add a chat message.
   */
  addMessage(msg: PeerChatMessage): void {
    this.messages.push(msg);
    this.callbacks.onMessageReceived?.(msg);

    // Resolve any waiting message waiters
    const now = msg.timestamp;
    for (const [id, waiter] of this.messageWaiters) {
      if (now <= waiter.after) continue;
      // If waiter has a `from` filter, only resolve if the message matches
      if (waiter.from && msg.from !== waiter.from) continue;
      const msgs = waiter.from
        ? this.getMessagesAfter(waiter.after).filter(m => m.from === waiter.from)
        : this.getMessagesAfter(waiter.after);
      waiter.resolve(msgs);
      this.messageWaiters.delete(id);
    }
  }

  /**
   * Get all chat messages.
   */
  getMessages(): PeerChatMessage[] {
    return this.messages;
  }

  /**
   * Get messages with chunk groups reassembled into single messages.
   * Chunks in the same group are concatenated in order.
   */
  getReassembledMessages(): PeerChatMessage[] {
    const result: PeerChatMessage[] = [];
    const chunkGroups = new Map<string, PeerChatMessage[]>();

    // Separate chunk messages from regular messages
    for (const msg of this.messages) {
      if (msg.chunkGroup && msg.chunkIndex !== undefined && msg.chunkTotal !== undefined) {
        const group = chunkGroups.get(msg.chunkGroup) ?? [];
        group.push(msg);
        chunkGroups.set(msg.chunkGroup, group);
      } else {
        result.push(msg);
      }
    }

    // Reassemble each chunk group
    for (const [, chunks] of chunkGroups) {
      chunks.sort((a, b) => (a.chunkIndex ?? 0) - (b.chunkIndex ?? 0));
      if (chunks.length === 0) continue;

      const first = chunks[0]!;
      const last = chunks[chunks.length - 1]!;
      result.push({
        id: `reassembled_${first.chunkGroup}`,
        from: first.from,
        fromName: first.fromName,
        text: chunks.map(c => c.text).join(''),
        color: first.color,
        timestamp: first.timestamp,
        chunkGroup: first.chunkGroup,
        chunkIndex: 0,
        chunkTotal: chunks.length,
      });
    }

    // Sort by timestamp to maintain order
    result.sort((a, b) => a.timestamp - b.timestamp);
    return result;
  }

  /**
   * Get messages after a given timestamp.
   */
  getMessagesAfter(timestamp: number): PeerChatMessage[] {
    return this.messages.filter(m => m.timestamp > timestamp);
  }

  /**
   * Get reassembled messages after a given timestamp.
   */
  getReassembledMessagesAfter(timestamp: number): PeerChatMessage[] {
    return this.getReassembledMessages().filter(m => m.timestamp > timestamp);
  }

  /**
   * Check the completion status of a chunk group.
   * Returns how many chunks were received vs expected, or null if group not found.
   */
  getChunkGroupStatus(group: string): { received: number; expected: number } | null {
    const chunks = this.messages.filter(m => m.chunkGroup === group);
    if (chunks.length === 0) return null;
    const expected = chunks[0]?.chunkTotal ?? chunks.length;
    const unique = new Set(chunks.map(c => c.chunkIndex));
    return { received: unique.size, expected };
  }

  /**
   * Wait for a new message to arrive.
   * Returns messages received after `after` timestamp.
   * If `timeout` ms elapses with no new message, returns empty array.
   */
  waitForNewMessage(after: number, timeout: number): Promise<PeerChatMessage[]> {
    return new Promise(resolve => {
      const id = `wait_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      this.messageWaiters.set(id, { resolve, after });

      // Timeout: resolve with empty array
      setTimeout(() => {
        if (this.messageWaiters.delete(id)) {
          resolve([]);
        }
      }, timeout);
    });
  }

  /**
   * Wait for a message from a specific peer.
   * Returns messages from that peer after `after` timestamp.
   * If `timeout` ms elapses with no matching message, returns empty array.
   */
  waitForMessageFrom(after: number, timeout: number, from: string): Promise<PeerChatMessage[]> {
    // Check if there's already a message from this peer
    const existing = this.messages.filter(m => m.timestamp > after && m.from === from);
    if (existing.length > 0) {
      return Promise.resolve(existing);
    }

    return new Promise(resolve => {
      const id = `wait_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      this.messageWaiters.set(id, { resolve, after, from });

      // Timeout: resolve with empty array
      setTimeout(() => {
        if (this.messageWaiters.delete(id)) {
          resolve([]);
        }
      }, timeout);
    });
  }

  /**
   * Clear chat messages.
   */
  clearMessages(): void {
    this.messages = [];
  }

  /**
   * Add a todo.
   */
  addTodo(todo: PeerTodo): void {
    this.todos.push(todo);
    this.callbacks.onTodoReceived?.(todo);
  }

  /**
   * Get all todos.
   */
  getTodos(): PeerTodo[] {
    return this.todos;
  }

  /**
   * Update a todo's status.
   */
  updateTodoStatus(id: string, status: 'done' | 'rejected'): boolean {
    const todo = this.todos.find(t => t.id === id);
    if (!todo) return false;
    todo.status = status;
    return true;
  }

  /**
   * Create a chat message and add it to the store.
   */
  createMessage(from: string, fromName: string, text: string): PeerChatMessage {
    const msg: PeerChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      from,
      fromName,
      text,
      color: peerColorFromId(from),
      timestamp: Date.now(),
    };
    this.addMessage(msg);
    return msg;
  }

  /** Set a display name for a peer. */
  setPeerName(peerId: string, name: string): void {
    const tags = this.peerTags.get(peerId) ?? {};
    tags.displayName = name;
    this.peerTags.set(peerId, tags);
  }

  /** Set a role for a peer. */
  setPeerRole(peerId: string, role: string): void {
    const tags = this.peerTags.get(peerId) ?? {};
    tags.role = role;
    this.peerTags.set(peerId, tags);
  }

  /** Get tags for a peer. */
  getPeerTags(peerId: string): PeerTags | undefined {
    return this.peerTags.get(peerId);
  }

  /** Get all peer tags. */
  getAllPeerTags(): Array<{ peerId: string; tags: PeerTags }> {
    return Array.from(this.peerTags.entries()).map(([peerId, tags]) => ({ peerId, tags }));
  }

  /** Resolve display name — custom name or fallback to hostname */
  resolveName(peer: PeerInfo): string {
    const tags = this.peerTags.get(peer.id);
    return tags?.displayName ?? peer.hostname;
  }

  /** Resolve role label. */
  resolveRole(peer: PeerInfo): string | undefined {
    const tags = this.peerTags.get(peer.id);
    return tags?.role;
  }

  /**
   * Remove stale peers.
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [id, peer] of this.peers) {
      if (now - peer.lastSeen > PEER_STALE_TIMEOUT) {
        this.peers.delete(id);
        this.callbacks.onPeerRemoved?.(id);
        logForDebugging(`[PeerStore] Evicted stale peer: ${peer.hostname}`);
      }
    }
  }

  /**
   * Destroy the store and clean up.
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.peers.clear();
    this.messages = [];
    this.todos = [];
  }

  /** Number of known peers. */
  get size(): number {
    return this.peers.size;
  }
}

/**
 * Singleton store instance shared across the app.
 */
let globalStore: PeerStore | null = null;

export function getGlobalPeerStore(): PeerStore {
  if (!globalStore) {
    globalStore = new PeerStore();
  }
  return globalStore;
}
