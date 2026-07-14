/**
 * Extracted peer swarm dispatch logic used by both PeerSwarmTool and the Swarm dashboard.
 * Handles fetching to peers, tracking progress via SwarmActivityRegistry, and collecting results.
 */

import type { Output } from '../tools/PeerSwarmTool/PeerSwarmTool.js';
import { clampTimeout, notifyPeerFeedback } from '../tools/peer/peerFeedback.js';
import { errorMessage } from '../utils/errors.js';
import { getGlobalDiscovery } from './PeerDiscovery.js';
import { getGlobalPeerStore } from './PeerStore.js';
import { getSwarmActivityRegistry } from './swarmActivity.js';

export interface DispatchOptions {
  onProgress?: (event: DispatchProgressEvent) => void;
  runId?: string;
}

export interface DispatchProgressEvent {
  type: 'start' | 'peer_start' | 'peer_complete' | 'complete';
  runId: string;
  hostname?: string;
  status?: string;
}

export async function dispatchSwarmCommand(
  input: { command: string; filter?: string; timeout?: number },
  options: DispatchOptions = {},
): Promise<Output> {
  const store = getGlobalPeerStore();
  const registry = getSwarmActivityRegistry();
  const runId = options.runId || `swarm-${Date.now()}`;

  const allPeers = store.getConnections().filter(p => p.status === 'online' && p.port > 0);
  notifyPeerFeedback(`running swarm command: ${input.command.slice(0, 100)}`, 'peer-swarm', 'low');

  if (allPeers.length === 0) {
    notifyPeerFeedback('swarm skipped: no connected peers', 'peer-swarm-result', 'low');
    return {
      success: false,
      totalPeers: 0,
      succeeded: 0,
      failed: 0,
      timedOut: 0,
      results: [],
    };
  }

  let peers = allPeers;
  if (input.filter) {
    const f = input.filter.toLowerCase();
    peers = allPeers.filter(p => {
      const tags = store.getPeerTags(p.id);
      const name = p.hostname.toLowerCase();
      const role = (tags?.role ?? '').toLowerCase();
      return name.includes(f) || role.includes(f);
    });
    if (peers.length === 0) {
      notifyPeerFeedback(`swarm skipped: no peers match "${input.filter}"`, 'peer-swarm-result', 'high');
      return {
        success: false,
        totalPeers: allPeers.length,
        succeeded: 0,
        failed: 0,
        timedOut: 0,
        results: [],
        error: `No peers match filter "${input.filter}"`,
      };
    }
  }

  const timeoutMs = clampTimeout(input.timeout, 60, 300);
  registry.startRun(input.command, input.filter, input.timeout ?? 60);
  options.onProgress?.({ type: 'start', runId });

  const results: Output['results'] = [];
  let succeeded = 0;
  let failed = 0;
  let timedOut = 0;
  notifyPeerFeedback(`sending swarm command to ${peers.length} peer(s)`, 'peer-swarm-send', 'low');

  const requests = peers.map(async peer => {
    const start = performance.now();
    const abort = new AbortController();

    try {
      registry.updatePeer(runId, peer.hostname, 'running', {
        startedAt: Date.now(),
        abort,
      });
      options.onProgress?.({ type: 'peer_start', runId, hostname: peer.hostname });
      notifyPeerFeedback(`running on ${peer.hostname}:${peer.port}`, 'peer-swarm-peer', 'low');

      const url = `http://${peer.ip || '127.0.0.1'}:${peer.port}/peer-exec`;
      const discovery = getGlobalDiscovery();
      const targetToken = store.getPeerToken(peer.id) || discovery.getPeerToken(peer.id) || '';

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: input.command,
          priority: 'normal',
          from: 'ai-agent',
          fromName: 'Clew AI',
          token: targetToken,
        }),
        signal: abort.signal,
      });

      const durationMs = Math.round(performance.now() - start);

      if (!response.ok && response.status !== 503) {
        failed++;
        registry.updatePeer(runId, peer.hostname, 'failed', { durationMs });
        results.push({
          hostname: peer.hostname,
          success: false,
          error: `HTTP ${response.status}`,
          durationMs,
        });
        options.onProgress?.({ type: 'peer_complete', runId, hostname: peer.hostname, status: 'failed' });
        return;
      }

      const body = await response.json();

      if (body.queued) {
        failed++;
        registry.updatePeer(runId, peer.hostname, 'failed', { durationMs });
        results.push({
          hostname: peer.hostname,
          success: false,
          error: `queued (position ${body.queuePosition})`,
          durationMs,
        });
        options.onProgress?.({ type: 'peer_complete', runId, hostname: peer.hostname, status: 'failed' });
        return;
      }

      if (body.result) {
        const ok = body.result.exitCode === 0;
        if (ok) succeeded++;
        else failed++;
        registry.updatePeer(runId, peer.hostname, ok ? 'done' : 'failed', { durationMs });
        results.push({
          hostname: peer.hostname,
          success: ok,
          stdout: body.result.stdout ?? '',
          stderr: body.result.stderr ?? '',
          exitCode: body.result.exitCode,
          durationMs,
        });
        options.onProgress?.({ type: 'peer_complete', runId, hostname: peer.hostname, status: ok ? 'done' : 'failed' });
        return;
      }

      failed++;
      registry.updatePeer(runId, peer.hostname, 'failed', { durationMs });
      results.push({
        hostname: peer.hostname,
        success: false,
        error: body.error || 'Unknown response',
        durationMs,
      });
      options.onProgress?.({ type: 'peer_complete', runId, hostname: peer.hostname, status: 'failed' });
    } catch (err: any) {
      const durationMs = Math.round(performance.now() - start);
      const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
      if (isTimeout) timedOut++;
      else failed++;

      registry.updatePeer(runId, peer.hostname, isTimeout ? 'timedout' : 'failed', { durationMs });
      results.push({
        hostname: peer.hostname,
        success: false,
        error: isTimeout ? `timed out after ${timeoutMs / 1000}s` : errorMessage(err),
        durationMs,
      });
      options.onProgress?.({
        type: 'peer_complete',
        runId,
        hostname: peer.hostname,
        status: isTimeout ? 'timedout' : 'failed',
      });
    }
  });

  await Promise.allSettled(requests);
  registry.completeRun(runId);

  notifyPeerFeedback(
    `swarm complete: ${succeeded}/${peers.length} peer(s) succeeded`,
    'peer-swarm-result',
    failed > 0 || timedOut > 0 ? 'high' : 'medium',
  );

  options.onProgress?.({ type: 'complete', runId });

  return {
    success: succeeded > 0,
    totalPeers: peers.length,
    succeeded,
    failed,
    timedOut,
    results,
  };
}
