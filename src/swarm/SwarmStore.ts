/**
 * SwarmStore — In-memory registry of discovered peers with auto-eviction.
 *
 * - Add/update peers as they're discovered via UDP
 * - Remove stale peers (no heartbeat for SWARM_STALE_TIMEOUT)
 * - Query by ID or list all
 */

import { logForDebugging } from '../utils/debug.js';
import {
  SWARM_CONNECTION_PING_INTERVAL,
  SWARM_PING_TIMEOUT,
  SWARM_STALE_TIMEOUT,
  type SwarmChatMessage,
  type SwarmInfo,
  type SwarmTodo,
  swarmColorFromId,
} from './types.js';

export type SwarmStoreCallbacks = {
  onPeerAdded?: (peer: SwarmInfo) => void;
  onPeerUpdated?: (peer: SwarmInfo) => void;
  onPeerRemoved?: (swarmId: string) => void;
  onPeerLost?: (swarmId: string) => void;
  onMessageReceived?: (msg: SwarmChatMessage) => void;
  onTodoReceived?: (todo: SwarmTodo) => void;
};

export type SwarmTags = {
  displayName?: string;
  role?: string;
};

export class SwarmStore {
  /** Discovered peers (auto-cleaned) */
  private peers = new Map<string, SwarmInfo>();
  /** Explicitly joined peers (persistent, never cleaned) */
  private connections = new Map<string, SwarmInfo>();
  private messages: SwarmChatMessage[] = [];
  private todos: SwarmTodo[] = [];
  private swarmTags = new Map<string, SwarmTags>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private callbacks: SwarmStoreCallbacks;
  /** Resolve functions waiting for new messages, keyed by a unique ID */
  private messageWaiters = new Map<
    string,
    { resolve: (msgs: SwarmChatMessage[]) => void; after: number; from?: string }
  >();

  constructor(callbacks?: SwarmStoreCallbacks) {
    this.callbacks = callbacks ?? {};
    // Start stale peer cleanup
    this.cleanupTimer = setInterval(() => this.cleanup(), 30_000);
    // Start HTTP liveness pings for joined connections
    this.pingTimer = setInterval(() => this.pingConnections(), SWARM_CONNECTION_PING_INTERVAL);
  }

  /** Update callbacks after creation (e.g., to wire up SSE events). */
  setCallbacks(callbacks: SwarmStoreCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * Add a peer that was explicitly joined (persistent, never auto-cleaned).
   */
  addConnection(peer: SwarmInfo): void {
    this.connections.set(peer.id, { ...peer });
    this.swarmTags.set(peer.id, this.swarmTags.get(peer.id) ?? {});
    this.callbacks.onPeerAdded?.(peer);
    logForDebugging(`[SwarmStore] New connection: ${peer.hostname} (${peer.ip}:${swarm.port})`);
  }

  /**
   * Add or update a discovered peer.
   */
  addPeer(peer: SwarmInfo): void {
    const existing = this.peers.get(peer.id);
    if (existing) {
      existing.lastSeen = peer.lastSeen;
      existing.status = peer.status;
      existing.cwd = peer.cwd || existing.cwd;
      existing.sessionId = peer.sessionId || existing.sessionId;
      existing.isBusy = peer.isBusy;
      existing.queueDepth = peer.queueDepth;
      existing.latencyMs = peer.latencyMs ?? existing.latencyMs;
      existing.lastConnectionError = peer.lastConnectionError;
      this.callbacks.onPeerUpdated?.(existing);
    } else {
      this.peers.set(peer.id, { ...peer });
      this.callbacks.onPeerAdded?.(peer);
      logForDebugging(`[SwarmStore] New peer: ${peer.hostname} (${peer.ip}:${swarm.port})`);
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
  getPeers(): SwarmInfo[] {
    const all = new Map(this.peers);
    for (const [id, peer] of this.connections) {
      all.set(id, peer);
    }
    return Array.from(all.values());
  }

  /** Get only explicitly joined connections. */
  getConnections(): SwarmInfo[] {
    return Array.from(this.connections.values());
  }

  /**
   * Get a peer by ID (searches both discovered and connected).
   */
  getPeer(id: string): SwarmInfo | undefined {
    return this.peers.get(id) ?? this.connections.get(id);
  }

  /**
   * Get peer by port (searches both discovered and connected).
   */
  getPeerByPort(port: number): SwarmInfo | undefined {
    for (const peer of this.allPeers()) {
      if (swarm.port === port) return peer;
    }
    return undefined;
  }

  /** Iterate all peers (discovered + connected) */
  private *allPeers(): Generator<SwarmInfo> {
    yield* this.peers.values();
    yield* this.connections.values();
  }

  /**
   * Find a peer by hostname (partial match), display name, or id.
   */
  findPeer(query: string): SwarmInfo | undefined {
    const q = query.toLowerCase();
    for (const peer of this.allPeers()) {
      if (peer.id.toLowerCase() === q || peer.hostname.toLowerCase() === q) return peer;
      const tags = this.swarmTags.get(peer.id);
      const displayName = tags?.displayName?.toLowerCase();
      if (displayName === q) return peer;
    }
    for (const peer of this.allPeers()) {
      if (peer.id.toLowerCase().startsWith(q) || peer.hostname.toLowerCase().startsWith(q)) return peer;
      const tags = this.swarmTags.get(peer.id);
      const displayName = tags?.displayName?.toLowerCase();
      if (displayName?.startsWith(q)) return peer;
    }
    // Also search by ip:port format
    for (const peer of this.allPeers()) {
      const addr = `${peer.ip}:${swarm.port}`;
      if (addr === q || addr.startsWith(q)) return peer;
    }
    return undefined;
  }

  /**
   * Add a chat message.
   */
  addMessage(msg: SwarmChatMessage): void {
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
  getMessages(): SwarmChatMessage[] {
    return this.messages;
  }

  /**
   * Get messages with chunk groups reassembled into single messages.
   * Chunks in the same group are concatenated in order.
   */
  getReassembledMessages(): SwarmChatMessage[] {
    const result: SwarmChatMessage[] = [];
    const chunkGroups = new Map<string, SwarmChatMessage[]>();

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
  getMessagesAfter(timestamp: number): SwarmChatMessage[] {
    return this.messages.filter(m => m.timestamp > timestamp);
  }

  /**
   * Get reassembled messages after a given timestamp.
   */
  getReassembledMessagesAfter(timestamp: number): SwarmChatMessage[] {
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
  waitForNewMessage(after: number, timeout: number): Promise<SwarmChatMessage[]> {
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
  waitForMessageFrom(after: number, timeout: number, from: string): Promise<SwarmChatMessage[]> {
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
  addTodo(todo: SwarmTodo): void {
    this.todos.push(todo);
    this.callbacks.onTodoReceived?.(todo);
  }

  /**
   * Get all todos.
   */
  getTodos(): SwarmTodo[] {
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
  createMessage(from: string, fromName: string, text: string): SwarmChatMessage {
    const msg: SwarmChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      from,
      fromName,
      text,
      color: swarmColorFromId(from),
      timestamp: Date.now(),
    };
    this.addMessage(msg);
    return msg;
  }

  /** Set a display name for a peer. */
  setPeerName(swarmId: string, name: string): void {
    const tags = this.swarmTags.get(swarmId) ?? {};
    tags.displayName = name;
    this.swarmTags.set(swarmId, tags);
  }

  /** Set a role for a peer. */
  setPeerRole(swarmId: string, role: string): void {
    const tags = this.swarmTags.get(swarmId) ?? {};
    tags.role = role;
    this.swarmTags.set(swarmId, tags);
  }

  /** Get tags for a peer. */
  getPeerTags(swarmId: string): SwarmTags | undefined {
    return this.swarmTags.get(swarmId);
  }

  /** Get all peer tags. */
  getAllPeerTags(): Array<{ swarmId: string; tags: SwarmTags }> {
    return Array.from(this.swarmTags.entries()).map(([swarmId, tags]) => ({ swarmId, tags }));
  }

  /** Resolve display name — custom name or fallback to hostname */
  resolveName(peer: SwarmInfo): string {
    const tags = this.swarmTags.get(peer.id);
    return tags?.displayName ?? peer.hostname;
  }

  /** Resolve role label. */
  resolveRole(peer: SwarmInfo): string | undefined {
    const tags = this.swarmTags.get(peer.id);
    return tags?.role;
  }

  /**
   * HTTP-liveness-ping all joined connections and mark offline on failure.
   */
  private pingConnections(): void {
    for (const [id, peer] of this.connections) {
      this.pingPeerInfo(id, peer);
    }
  }

  /**
   * Ping a single peer's HTTP /swarm-info endpoint.
   * On success: update lastSeen + status to online.
   * On failure: mark offline and fire callback.
   */
  private async pingPeerInfo(id: string, peer: SwarmInfo): Promise<void> {
    try {
      const url = `http://${peer.ip || '127.0.0.1'}:${swarm.port}/swarm-info`;
      const startedAt = performance.now();
      const res = await fetch(url, { signal: AbortSignal.timeout(SWARM_PING_TIMEOUT) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const info = await res.json();
      peer.lastSeen = Date.now();
      peer.status = 'online';
      peer.latencyMs = performance.now() - startedAt;
      peer.lastConnectionError = undefined;
      peer.cwd = info.cwd || peer.cwd;
      peer.sessionId = info.sessionId || peer.sessionId;
      peer.isBusy = info.isBusy === true;
      peer.queueDepth = typeof info.queueDepth === 'number' ? info.queueDepth : 0;
      logForDebugging(`[SwarmStore] Liveness ok: ${peer.hostname}:${swarm.port}`);
    } catch (err) {
      // Peer is unreachable — mark offline
      peer.lastConnectionError = err instanceof Error ? err.message : String(err);
      if (peer.status !== 'offline') {
        peer.status = 'offline';
        this.callbacks.onPeerLost?.(id);
        logForDebugging(`[SwarmStore] Liveness fail: ${peer.hostname}:${swarm.port} — marked offline`);
      }
    }
  }

  /**
   * Remove stale peers.
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [id, peer] of this.peers) {
      if (now - peer.lastSeen > SWARM_STALE_TIMEOUT) {
        this.peers.delete(id);
        this.callbacks.onPeerRemoved?.(id);
        logForDebugging(`[SwarmStore] Evicted stale peer: ${peer.hostname}`);
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
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
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
let globalStore: SwarmStore | null = null;

export function getGlobalSwarmStore(): SwarmStore {
  if (!globalStore) {
    globalStore = new SwarmStore();
  }
  return globalStore;
}
