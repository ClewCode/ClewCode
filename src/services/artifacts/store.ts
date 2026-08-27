/**
 * RetainedArtifactStore — L2 ephemeral state manager.
 * Keeps large raw payloads outside L1 context while retaining fast, reversible retrieval.
 */

import { generateArtifactHandle } from './handles.js';
import type { PutArtifactOptions, RetainedArtifact, RetainedArtifactMetadata } from './types.js';

export class RetainedArtifactStore {
  private artifacts = new Map<string, RetainedArtifact>();
  private handleIndex = new Map<string, string>(); // handle -> id
  private sequence = 0;

  /**
   * Puts content into L2 storage and returns its metadata + handle.
   */
  put(options: PutArtifactOptions): RetainedArtifactMetadata {
    this.sequence++;
    const id = `art_${Date.now()}_${this.sequence}`;
    const handle = generateArtifactHandle(options.type, this.sequence);

    // Rough token estimate: ~4 chars per token
    const tokenEstimate = Math.ceil(options.content.length / 4);
    const now = new Date();
    const expiresAt = options.ttlMs ? new Date(now.getTime() + options.ttlMs).toISOString() : undefined;

    const artifact: RetainedArtifact = {
      id,
      handle,
      type: options.type,
      label: options.label,
      ownerAgentId: options.ownerAgentId,
      content: options.content,
      tokenEstimate,
      createdTurn: options.createdTurn ?? 0,
      createdAt: now.toISOString(),
      expiresAt,
      ttlMs: options.ttlMs,
    };

    this.artifacts.set(id, artifact);
    this.handleIndex.set(handle, id);

    const { content: _, ...metadata } = artifact;
    return metadata;
  }

  /**
   * Retrieves artifact content by ID or Handle.
   */
  get(idOrHandle: string): RetainedArtifact | undefined {
    const id = this.handleIndex.get(idOrHandle) || idOrHandle;
    return this.artifacts.get(id);
  }

  /**
   * Restores artifact content by handle, updating access metrics.
   */
  restore(handle: string): string | undefined {
    const artifact = this.get(handle);
    if (!artifact) return undefined;
    return artifact.content;
  }

  /**
   * Lists all currently retained artifacts for an agent (or all agents).
   */
  list(ownerAgentId?: string): RetainedArtifactMetadata[] {
    const all = Array.from(this.artifacts.values());
    const filtered = ownerAgentId ? all.filter(a => a.ownerAgentId === ownerAgentId) : all;
    return filtered.map(({ content: _, ...meta }) => meta);
  }

  /**
   * Prunes all artifacts owned by a finished subagent.
   */
  pruneAgentArtifacts(ownerAgentId: string): number {
    let removed = 0;
    for (const [id, art] of Array.from(this.artifacts.entries())) {
      if (art.ownerAgentId === ownerAgentId) {
        this.handleIndex.delete(art.handle);
        this.artifacts.delete(id);
        removed++;
      }
    }
    return removed;
  }

  /**
   * Garbage collector for expired artifacts (TTL based).
   */
  gc(): number {
    const now = Date.now();
    let removed = 0;

    for (const [id, art] of Array.from(this.artifacts.entries())) {
      if (art.expiresAt) {
        const exp = new Date(art.expiresAt).getTime();
        if (now > exp) {
          this.handleIndex.delete(art.handle);
          this.artifacts.delete(id);
          removed++;
        }
      }
    }

    return removed;
  }

  clear(): void {
    this.artifacts.clear();
    this.handleIndex.clear();
  }
}

// Global Singleton
let globalArtifactStore: RetainedArtifactStore | null = null;
export function getRetainedArtifactStore(): RetainedArtifactStore {
  if (!globalArtifactStore) {
    globalArtifactStore = new RetainedArtifactStore();
  }
  return globalArtifactStore;
}
