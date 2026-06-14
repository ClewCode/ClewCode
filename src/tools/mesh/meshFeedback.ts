import type { MeshInfo } from '../../mesh/types.js';

export type MeshFeedbackPriority = 'low' | 'medium' | 'high' | 'immediate';

type MeshFeedbackHandler = (message: string, key?: string, priority?: MeshFeedbackPriority) => void;

let onMeshFeedback: MeshFeedbackHandler | null = null;

export function setMeshFeedbackHandler(handler: MeshFeedbackHandler | null): void {
  onMeshFeedback = handler;
}

export function notifyMeshFeedback(
  message: string,
  key = 'mesh-feedback',
  priority: MeshFeedbackPriority = 'medium',
): void {
  onMeshFeedback?.(message, key, priority);
}

export function truncateText(text: string | undefined, maxLength = 160): string {
  const value = text?.trim() ?? '';
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}\u2026`;
}

export function formatMeshTarget(mesh: MeshInfo | undefined, fallback: string): string {
  if (!mesh) return fallback;
  const name = mesh.hostname || fallback;
  return `${name}:${mesh.port}`;
}

export function formatMeshDetails(worker: MeshInfo): string {
  const role = (worker as any).role || (worker as any).tags?.join(', ');
  return `${worker.hostname ?? 'mesh'}:${worker.port ?? '?'}${role ? ` [${role}]` : ''}`;
}

export function formatMeshList(peers: Array<{ hostname?: string; port?: number }>, limit = 6): string {
  if (peers.length === 0) return 'none';
  const visible = peers.slice(0, limit).map(peer => `${peer.hostname ?? 'mesh'}:${peer.port ?? '?'}`);
  return `${visible.join(', ')}${peers.length > limit ? `, +${peers.length - limit} more` : ''}`;
}
