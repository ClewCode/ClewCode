import type { SwarmInfo } from '../../swarm/types.js';

export type SwarmFeedbackPriority = 'low' | 'medium' | 'high' | 'immediate';

type SwarmFeedbackHandler = (message: string, key?: string, priority?: SwarmFeedbackPriority) => void;

let onSwarmFeedback: SwarmFeedbackHandler | null = null;

export function setSwarmFeedbackHandler(handler: SwarmFeedbackHandler | null): void {
  onSwarmFeedback = handler;
}

export function notifySwarmFeedback(
  message: string,
  key = 'swarm-feedback',
  priority: SwarmFeedbackPriority = 'medium',
): void {
  onSwarmFeedback?.(message, key, priority);
}

export function truncateText(text: string | undefined, maxLength = 160): string {
  const value = text?.trim() ?? '';
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}\u2026`;
}

export function formatSwarmTarget(swarm: SwarmInfo | undefined, fallback: string): string {
  if (!swarm) return fallback;
  const name = swarm.hostname || fallback;
  return `${name}:${swarm.port}`;
}

export function formatSwarmDetails(worker: SwarmInfo): string {
  const role = (worker as any).role || (worker as any).tags?.join(', ');
  return `${worker.hostname ?? 'swarm'}:${worker.port ?? '?'}${role ? ` [${role}]` : ''}`;
}

export function formatSwarmList(peers: Array<{ hostname?: string; port?: number }>, limit = 6): string {
  if (peers.length === 0) return 'none';
  const visible = peers.slice(0, limit).map(peer => `${peer.hostname ?? 'swarm'}:${peer.port ?? '?'}`);
  return `${visible.join(', ')}${peers.length > limit ? `, +${peers.length - limit} more` : ''}`;
}
