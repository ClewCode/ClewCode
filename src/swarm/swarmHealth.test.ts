import { describe, expect, test } from 'bun:test';
import { formatPeerLatency, formatPeerLoad, getPeerHealth, summarizePeerMesh } from './swarmHealth.js';
import type { SwarmInfo } from './types.js';

function swarm(overrides: Partial<SwarmInfo> = {}): SwarmInfo {
  return {
    id: 'swarm-1',
    hostname: 'worker',
    ip: '127.0.0.1',
    port: 4200,
    cwd: '/repo',
    version: 'test',
    lastSeen: 1_000,
    status: 'online',
    ...overrides,
  };
}

describe('swarmHealth', () => {
  test('classifies healthy, lagging, and offline swarms', () => {
    expect(getPeerHealth(swarm({ latencyMs: 25 }), 2_000)).toBe('healthy');
    expect(getPeerHealth(swarm({ latencyMs: 2_000 }), 2_000)).toBe('lagging');
    expect(getPeerHealth(swarm({ status: 'offline' }), 2_000)).toBe('offline');
    expect(getPeerHealth(swarm(), 100_000)).toBe('offline');
  });

  test('formats latency and queue load compactly', () => {
    expect(formatPeerLatency(swarm())).toBe('--');
    expect(formatPeerLatency(swarm({ latencyMs: 42.4 }))).toBe('42ms');
    expect(formatPeerLatency(swarm({ latencyMs: 1250 }))).toBe('1.3s');
    expect(formatPeerLoad(swarm())).toBe('idle');
    expect(formatPeerLoad(swarm({ isBusy: true }))).toBe('busy');
    expect(formatPeerLoad(swarm({ isBusy: true, queueDepth: 3 }))).toBe('busy+3');
  });

  test('summarizes mesh health and average latency', () => {
    const summary = summarizePeerMesh(
      [swarm({ id: 'a', latencyMs: 10 }), swarm({ id: 'b', latencyMs: 30 }), swarm({ id: 'c', status: 'offline' })],
      2_000,
    );

    expect(summary).toEqual({
      healthy: 2,
      lagging: 0,
      offline: 1,
      avgLatencyMs: 20,
    });
  });
});
