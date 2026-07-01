import type { PeerInfo } from '../../peer/types.js';

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

export function formatPeerDetails(worker: PeerInfo): string {
  const role = (worker as any).role || (worker as any).tags?.join(', ');
  return `${worker.hostname ?? 'peer'}:${worker.port ?? '?'}${role ? ` [${role}]` : ''}`;
}

export function formatPeerList(peers: Array<{ hostname?: string; port?: number }>, limit = 6): string {
  if (peers.length === 0) return 'none';
  const visible = peers.slice(0, limit).map(peer => `${peer.hostname ?? 'peer'}:${peer.port ?? '?'}`);
  return `${visible.join(', ')}${peers.length > limit ? `, +${peers.length - limit} more` : ''}`;
}

/**
 * Clamp a user-supplied timeout (in seconds) and convert to milliseconds.
 * Respects a minimum of 1s and a caller-specified maximum.
 */
export function clampTimeout(raw: number | undefined, defaultSecs: number, maxSecs: number): number {
  return Math.min(Math.max(1, raw ?? defaultSecs), maxSecs) * 1000;
}

/**
 * Retry an async action until it succeeds or a deadline expires.
 * Returns the final result plus waited/timedOut flags.
 *
 * @param attempt — async function that returns a result (caller determines success via `isSuccess`)
 * @param isSuccess — predicate on the result
 * @param timeoutMs — total retry window in milliseconds
 * @param retryInterval — pause between attempts in ms (default 2000)
 * @param onRetry — optional hook called before each retry (e.g. rediscover peers)
 */
export async function retryUntil<T>(
  attempt: () => Promise<T>,
  isSuccess: (result: T) => boolean,
  timeoutMs: number,
  retryInterval: number = 2000,
  onRetry?: () => Promise<void>,
): Promise<{ result: T; waited: boolean; timedOut: boolean }> {
  let result = await attempt();
  if (isSuccess(result)) return { result, waited: false, timedOut: false };

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await new Promise(resolve => setTimeout(resolve, Math.min(retryInterval, remaining)));
    if (onRetry) await onRetry();
    result = await attempt();
    if (isSuccess(result)) return { result, waited: true, timedOut: false };
  }

  return { result, waited: true, timedOut: !isSuccess(result) };
}
