/**
 * PeerStore — In-memory registry of discovered peers with auto-eviction.
 *
 * - Add/update peers as they're discovered via UDP
 * - Remove stale peers (no heartbeat for PEER_STALE_TIMEOUT)
 * - Query by ID or list all
 */

import { type PeerInfo, type PeerChatMessage, type PeerTodo, peerColorFromId, PEER_STALE_TIMEOUT } from './types.js';
import { logForDebugging } from '../utils/debug.js';

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

  constructor(callbacks?: PeerStoreCallbacks) {
    this.callbacks = callbacks ?? {};
    // Start stale peer cleanup
    this.cleanupTimer = setInterval(() => this.cleanup(), 30_000);
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
   * Find a peer by hostname (partial match).
   */
  findPeer(query: string): PeerInfo | undefined {
    const q = query.toLowerCase();
    for (const peer of this.allPeers()) {
      if (peer.id.toLowerCase() === q || peer.hostname.toLowerCase() === q) return peer;
    }
    for (const peer of this.allPeers()) {
      if (peer.id.toLowerCase().startsWith(q) || peer.hostname.toLowerCase().startsWith(q)) return peer;
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
  }

  /**
   * Get all chat messages.
   */
  getMessages(): PeerChatMessage[] {
    return this.messages;
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
