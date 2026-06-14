import { SWARM_HEARTBEAT_INTERVAL, SWARM_STALE_TIMEOUT, type SwarmInfo } from './types.js';

export type SwarmHealth = 'healthy' | 'lagging' | 'offline';

const SLOW_LATENCY_MS = 1500;

export function getPeerHealth(swarm: SwarmInfo, now = Date.now()): SwarmHealth {
  if (swarm.status === 'offline') return 'offline';

  const ageMs = Math.max(0, now - swarm.lastSeen);
  if (ageMs > SWARM_STALE_TIMEOUT) return 'offline';
  if (ageMs > SWARM_HEARTBEAT_INTERVAL * 2) return 'lagging';
  if (typeof swarm.latencyMs === 'number' && swarm.latencyMs > SLOW_LATENCY_MS) return 'lagging';

  return 'healthy';
}

export function formatPeerLatency(swarm: SwarmInfo): string {
  if (typeof swarm.latencyMs !== 'number') return '--';
  if (swarm.latencyMs < 1) return '<1ms';
  if (swarm.latencyMs < 1000) return `${Math.round(swarm.latencyMs)}ms`;
  return `${(swarm.latencyMs / 1000).toFixed(1)}s`;
}

export function formatPeerLoad(swarm: SwarmInfo): string {
  const queueDepth = swarm.queueDepth ?? 0;
  if (swarm.isBusy) return queueDepth > 0 ? `busy+${queueDepth}` : 'busy';
  return queueDepth > 0 ? `q${queueDepth}` : 'idle';
}

export function summarizePeerMesh(
  swarms: SwarmInfo[],
  now = Date.now(),
): {
  healthy: number;
  lagging: number;
  offline: number;
  avgLatencyMs?: number;
} {
  let healthy = 0;
  let lagging = 0;
  let offline = 0;
  const latencies = swarms
    .map(swarm => {
      const health = getPeerHealth(swarm, now);
      if (health === 'healthy') healthy++;
      else if (health === 'lagging') lagging++;
      else offline++;
      return swarm.latencyMs;
    })
    .filter((latency): latency is number => typeof latency === 'number');

  const avgLatencyMs =
    latencies.length > 0 ? latencies.reduce((total, latency) => total + latency, 0) / latencies.length : undefined;

  return { healthy, lagging, offline, avgLatencyMs };
}
