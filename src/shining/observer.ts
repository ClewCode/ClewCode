/**
 * Observer — collects signals for Shining
 * User Intent + Repo State + Task Graph + Tool Events + Memory + Recent Turns
 */

import type { ShiningEvent } from './types.js';

const buffer: ShiningEvent[] = [];
const MAX = 50;

export function observe(event: ShiningEvent): void {
  buffer.push({ ...event } as ShiningEvent);
  if (buffer.length > MAX) buffer.shift();
}

export function getRecentEvents(limit = 20): ShiningEvent[] {
  return buffer.slice(-limit);
}

export function clearEvents(): void {
  buffer.length = 0;
}
