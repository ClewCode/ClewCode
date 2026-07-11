/**
 * In-memory registry for tracking active and recent peer swarm command dispatches.
 * Allows the dashboard to monitor progress, display status, and abort individual peers.
 */

import { randomUUID } from 'crypto';

export interface PeerActivityState {
  status: 'pending' | 'running' | 'done' | 'failed' | 'timedout' | 'aborted';
  abort?: AbortController;
  durationMs?: number;
  startedAt: number;
  completedAt?: number;
  tokens?: number;
  error?: string;
  exitCode?: number;
}

export interface SwarmRunEntry {
  runId: string;
  command: string;
  filter?: string;
  timeout: number;
  startedAt: number;
  peers: Map<string, PeerActivityState>;
}

class SwarmActivityRegistry {
  private activeRuns = new Map<string, SwarmRunEntry>();
  private recentRuns: SwarmRunEntry[] = [];
  private readonly maxRecent = 20;
  private listeners = new Set<() => void>();

  startRun(command: string, filter?: string, timeout = 60): string {
    const runId = randomUUID();
    const entry: SwarmRunEntry = {
      runId,
      command,
      filter,
      timeout,
      startedAt: Date.now(),
      peers: new Map(),
    };
    this.activeRuns.set(runId, entry);
    this.notifyListeners();
    return runId;
  }

  updatePeer(runId: string, hostname: string, status: PeerActivityState['status'], data?: Partial<PeerActivityState>): void {
    const run = this.activeRuns.get(runId);
    if (!run) return;
    const peer = run.peers.get(hostname) ?? { status: 'pending', startedAt: Date.now() };
    run.peers.set(hostname, {
      ...peer,
      status,
      ...data,
    });
    this.notifyListeners();
  }

  completeRun(runId: string): SwarmRunEntry | undefined {
    const run = this.activeRuns.get(runId);
    if (!run) return;

    this.activeRuns.delete(runId);
    this.recentRuns.unshift(run);
    if (this.recentRuns.length > this.maxRecent) {
      this.recentRuns.pop();
    }
    this.notifyListeners();
    return run;
  }

  abortPeer(runId: string, hostname: string): boolean {
    const run = this.activeRuns.get(runId);
    if (!run) return false;
    const peer = run.peers.get(hostname);
    if (!peer?.abort) return false;
    peer.abort.abort();
    peer.status = 'aborted';
    this.notifyListeners();
    return true;
  }

  getActiveRuns(): SwarmRunEntry[] {
    return Array.from(this.activeRuns.values());
  }

  getRecentRuns(n?: number): SwarmRunEntry[] {
    return this.recentRuns.slice(0, n ?? this.maxRecent);
  }

  getAllRuns(): SwarmRunEntry[] {
    return [...this.getActiveRuns(), ...this.getRecentRuns()];
  }

  subscribe(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notifyListeners(): void {
    this.listeners.forEach(cb => cb());
  }
}

const globalRegistry = new SwarmActivityRegistry();

export function getSwarmActivityRegistry(): SwarmActivityRegistry {
  return globalRegistry;
}
