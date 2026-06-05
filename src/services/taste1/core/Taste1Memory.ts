// Clew taste-1: In-memory event and rule ring buffer for recent context

import type { TasteEvent, TasteRule } from './Taste1Types.js';

const MAX_RECENT_EVENTS = 200;
const MAX_CACHED_RULES = 100;

/**
 * Lightweight in-memory store for recent events and active rules.
 * Used by the runtime to quickly access current state without disk I/O.
 */
export class Taste1Memory {
  private recentEvents: TasteEvent[] = [];
  private cachedRules: Map<string, TasteRule> = new Map();
  private sessionStartTime: string;

  constructor() {
    this.sessionStartTime = new Date().toISOString();
  }

  getSessionStartTime(): string {
    return this.sessionStartTime;
  }

  pushEvent(event: TasteEvent): void {
    this.recentEvents.push(event);
    if (this.recentEvents.length > MAX_RECENT_EVENTS) {
      this.recentEvents.shift();
    }
  }

  getRecentEvents(count = 50): TasteEvent[] {
    return this.recentEvents.slice(-count);
  }

  getAllEvents(): TasteEvent[] {
    return [...this.recentEvents];
  }

  cacheRule(rule: TasteRule): void {
    this.cachedRules.set(rule.id, rule);
    if (this.cachedRules.size > MAX_CACHED_RULES) {
      // Evict oldest entry
      const firstKey = this.cachedRules.keys().next().value;
      if (firstKey) this.cachedRules.delete(firstKey);
    }
  }

  removeCachedRule(id: string): void {
    this.cachedRules.delete(id);
  }

  getCachedRules(): TasteRule[] {
    return [...this.cachedRules.values()];
  }

  getCachedRule(id: string): TasteRule | undefined {
    return this.cachedRules.get(id);
  }

  getRecentAccepts(count = 20): TasteEvent[] {
    return this.recentEvents.filter(e => e.type === 'accept').slice(-count);
  }

  getRecentRejects(count = 10): TasteEvent[] {
    return this.recentEvents.filter(e => e.type === 'reject').slice(-count);
  }

  clear(): void {
    this.recentEvents = [];
    this.cachedRules.clear();
  }
}
