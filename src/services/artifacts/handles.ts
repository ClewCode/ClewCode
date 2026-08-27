/**
 * Unique short handle generation for Retained Artifacts.
 */

export function generateArtifactHandle(type: string, seq: number): string {
  const shortType = type.slice(0, 4);
  const randomSuffix = Math.random().toString(36).slice(2, 6);
  return `@artifact:${shortType}_${seq}_${randomSuffix}`;
}

export function isArtifactHandle(handle: string): boolean {
  return typeof handle === 'string' && handle.startsWith('@artifact:');
}
