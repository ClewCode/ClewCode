import type { PeerInfo } from '../peer/types.js';

export type PeerFeedbackPriority = 'low' | 'medium' | 'high' | 'immediate';

type PeerFeedbackHandler = (message: string, key?: string, priority?: PeerFeedbackPriority) => void;

let onPeerFeedback: PeerFeedbackHandler | null = null;

export function setPeerFeedbackHandler(handler: PeerFeedbackHandler | null): void {
  onPeerFeedback = handler;
}

export function notifyPeerFeedback(
  message: string,
  key = 'peer-feedback',
  priority: PeerFeedbackPriority = 'medium',
): void {
  onPeerFeedback?.(message, key, priority);
}

export function truncateText(text: string | undefined, maxLength = 160): string {
  const value = text?.trim() ?? '';
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}\u2026`;
}

export function formatPeerTarget(peer: PeerInfo | undefined, fallback: string): string {
  if (!peer) return fallback;
  const name = peer.hostname || fallback;
  return `${name}:${peer.port}`;
}

export function formatPeerList(peers: Array<{ hostname?: string; port?: number }>, limit = 6): string {
  if (peers.length === 0) return 'none';
  const visible = peers.slice(0, limit).map(peer => `${peer.hostname ?? 'peer'}:${peer.port ?? '?'}`);
  return `${visible.join(', ')}${peers.length > limit ? `, +${peers.length - limit} more` : ''}`;
}
