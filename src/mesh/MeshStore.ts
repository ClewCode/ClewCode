/**
 * MeshStore — In-memory registry of discovered peers with auto-eviction.
 *
 * - Add/update peers as they're discovered via UDP
 * - Remove stale peers (no heartbeat for MESH_STALE_TIMEOUT)
 * - Query by ID or list all
 */

import { logForDebugging } from '../utils/debug.js';
import {
  MESH_CONNECTION_PING_INTERVAL,
  MESH_PING_TIMEOUT,
  MESH_STALE_TIMEOUT,
  type MeshChatMessage,
  type MeshInfo,
  type MeshTodo,
  meshColorFromId,
} from './types.js';

export type MeshStoreCallbacks = {
  onPeerAdded?: (peer: MeshInfo) => void;
  onPeerUpdated?: (peer: MeshInfo) => void;
  onPeerRemoved?: (meshId: string) => void;
  onPeerLost?: (meshId: string) => void;
  onMessageReceived?: (msg: MeshChatMessage) => void;
  onTodoReceived?: (todo: MeshTodo) => void;
};

export type SwarmTags = {
  displayName?: string;
  role?: string;
};

export class MeshStore {
  /** Discovered peers (auto-cleaned) */
  private peers = new Map<string, MeshInfo>();
  /** Explicitly joined peers (persistent, never cleaned) */
  private connections = new Map<string, MeshInfo>();
  private messages: MeshChatMessage[] = [];
  private todos: MeshTodo[] = [];
  private swarmTags = new Map<string, SwarmTags>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private callbacks: MeshStoreCallbacks;
  /** Resolve functions waiting for new messages, keyed by a unique ID */
  private messageWaiters = new Map<
    string,
    { resolve: (msgs: MeshChatMessage[]) => void; after: number; from?: string }
  >();

  constructor(callbacks?: MeshStoreCallbacks) {
    this.callbacks = callbacks ?? {};
    // Start stale peer cleanup
    this.cleanupTimer = setInterval(() => this.cleanup(), 30_000);
    // Start HTTP liveness pings for joined connections
    this.pingTimer = setInterval(() => this.pingConnections(), MESH_CONNECTION_PING_INTERVAL);
  }

  /** Update callbacks after creation (e.g., to wire up SSE events). */
  setCallbacks(callbacks: MeshStoreCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * Add a peer that was explicitly joined (persistent, never auto-cleaned).
   */
  addConnection(peer: MeshInfo): void {
    this.connections.set(peer.id, { ...peer });
    this.swarmTags.set(peer.id, this.swarmTags.get(peer.id) ?? {});
    this.callbacks.onPeerAdded?.(peer);
    logForDebugging(`[MeshStore] New connection: ${peer.hostname} (${peer.ip}:${peer.port})`);
  }

  /**
   * Add or update a discovered peer.
   */
  addPeer(peer: MeshInfo): void {
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
      logForDebugging(`[MeshStore] New peer: ${peer.hostname} (${peer.ip}:${peer.port})`);
    }
  }

  /** Alias for addPeer — used by tool layer. */
  addMesh(peer: MeshInfo): void {
    this.addPeer(peer);
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
  getPeers(): MeshInfo[] {
    const all = new Map(this.peers);
    for (const [id, peer] of this.connections) {
      all.set(id, peer);
    }
    return Array.from(all.values());
  }

  /** Alias for getPeers — used by tool layer. */
  getMeshs(): MeshInfo[] {
    return this.getPeers();
  }

  /** Get only explicitly joined connections. */
  getConnections(): MeshInfo[] {
    return Array.from(this.connections.values());
  }

  /**
   * Get a peer by ID (searches both discovered and connected).
   */
  getPeer(id: string): MeshInfo | undefined {
    return this.peers.get(id) ?? this.connections.get(id);
  }

  /**
   * Get peer by port (searches both discovered and connected).
   */
  getPeerByPort(port: number): MeshInfo | undefined {
    for (const peer of this.allPeers()) {
      if (peer.port === port) return peer;
    }
    return undefined;
  }

  /** Alias for getPeerByPort — used by tool layer. */
  getMeshByPort(port: number): MeshInfo | undefined {
    return this.getPeerByPort(port);
  }

  /** Iterate all peers (discovered + connected) */
  private *allPeers(): Generator<MeshInfo> {
    yield* this.peers.values();
    yield* this.connections.values();
  }

  /**
   * Find a peer by hostname (partial match), display name, or id.
   */
  findPeer(query: string): MeshInfo | undefined {
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
      const addr = `${peer.ip}:${peer.port}`;
      if (addr === q || addr.startsWith(q)) return peer;
    }
    return undefined;
  }

  /** Alias for findPeer — used by tool layer. */
  findMesh(query: string): MeshInfo | undefined {
    return this.findPeer(query);
  }

  /**
   * Add a chat message.
   */
  addMessage(msg: MeshChatMessage): void {
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
  getMessages(): MeshChatMessage[] {
    return this.messages;
  }

  /**
   * Get messages with chunk groups reassembled into single messages.
   * Chunks in the same group are concatenated in order.
   */
  getReassembledMessages(): MeshChatMessage[] {
    const result: MeshChatMessage[] = [];
    const chunkGroups = new Map<string, MeshChatMessage[]>();

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
  getMessagesAfter(timestamp: number): MeshChatMessage[] {
    return this.messages.filter(m => m.timestamp > timestamp);
  }

  /**
   * Get reassembled messages after a given timestamp.
   */
  getReassembledMessagesAfter(timestamp: number): MeshChatMessage[] {
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
  waitForNewMessage(after: number, timeout: number): Promise<MeshChatMessage[]> {
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
  waitForMessageFrom(after: number, timeout: number, from: string): Promise<MeshChatMessage[]> {
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
  addTodo(todo: MeshTodo): void {
    this.todos.push(todo);
    this.callbacks.onTodoReceived?.(todo);
  }

  /**
   * Get all todos.
   */
  getTodos(): MeshTodo[] {
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
  createMessage(from: string, fromName: string, text: string): MeshChatMessage {
    const msg: MeshChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      from,
      fromName,
      text,
      color: meshColorFromId(from),
      timestamp: Date.now(),
    };
    this.addMessage(msg);
    return msg;
  }

  /** Set a display name for a peer. */
  setPeerName(meshId: string, name: string): void {
    const tags = this.swarmTags.get(meshId) ?? {};
    tags.displayName = name;
    this.swarmTags.set(meshId, tags);
  }

  /** Alias for setPeerName — used by tool layer. */
  setMeshName(meshId: string, name: string): void {
    this.setPeerName(meshId, name);
  }

  /** Set a role for a peer. */
  setPeerRole(meshId: string, role: string): void {
    const tags = this.swarmTags.get(meshId) ?? {};
    tags.role = role;
    this.swarmTags.set(meshId, tags);
  }

  /** Alias for setPeerRole — used by tool layer. */
  setMeshRole(meshId: string, role: string): void {
    this.setPeerRole(meshId, role);
  }

  /** Get tags for a peer. */
  getPeerTags(meshId: string): SwarmTags | undefined {
    return this.swarmTags.get(meshId);
  }

  /** Alias for getPeerTags — used by tool layer. */
  getMeshTags(meshId: string): SwarmTags | undefined {
    return this.getPeerTags(meshId);
  }

  /** Get all peer tags. */
  getAllPeerTags(): Array<{ meshId: string; tags: SwarmTags }> {
    return Array.from(this.swarmTags.entries()).map(([meshId, tags]) => ({ meshId, tags }));
  }

  /** Alias for getAllPeerTags — used by tool layer. */
  getAllMeshTags(): Array<{ meshId: string; tags: SwarmTags }> {
    return this.getAllPeerTags();
  }

  /** Resolve display name — custom name or fallback to hostname */
  resolveName(peer: MeshInfo): string {
    const tags = this.swarmTags.get(peer.id);
    return tags?.displayName ?? peer.hostname;
  }

  /** Resolve role label. */
  resolveRole(peer: MeshInfo): string | undefined {
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
   * Ping a single peer's HTTP /mesh-info endpoint.
   * On success: update lastSeen + status to online.
   * On failure: mark offline and fire callback.
   */
  private async pingPeerInfo(id: string, peer: MeshInfo): Promise<void> {
    try {
      const url = `http://${peer.ip || '127.0.0.1'}:${peer.port}/mesh-info`;
      const startedAt = performance.now();
      const res = await fetch(url, { signal: AbortSignal.timeout(MESH_PING_TIMEOUT) });
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
      logForDebugging(`[MeshStore] Liveness ok: ${peer.hostname}:${peer.port}`);
    } catch (err) {
      // Peer is unreachable — mark offline
      peer.lastConnectionError = err instanceof Error ? err.message : String(err);
      if (peer.status !== 'offline') {
        peer.status = 'offline';
        this.callbacks.onPeerLost?.(id);
        logForDebugging(`[MeshStore] Liveness fail: ${peer.hostname}:${peer.port} — marked offline`);
      }
    }
  }

  /**
   * Remove stale peers.
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [id, peer] of this.peers) {
      if (now - peer.lastSeen > MESH_STALE_TIMEOUT) {
        this.peers.delete(id);
        this.callbacks.onPeerRemoved?.(id);
        logForDebugging(`[MeshStore] Evicted stale peer: ${peer.hostname}`);
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
let globalStore: MeshStore | null = null;

export function getGlobalMeshStore(): MeshStore {
  if (!globalStore) {
    globalStore = new MeshStore();
  }
  return globalStore;
}
