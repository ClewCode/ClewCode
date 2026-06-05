// Clew taste-1: Append-only event log (JSONL)

import { existsSync } from 'fs';
import { appendFile, mkdir, readFile } from 'fs/promises';
import { dirname } from 'path';
import type { TasteEvent } from '../core/Taste1Types.js';

const MAX_EVENTS_IN_MEMORY = 500;

export class TasteEventLog {
  private events: TasteEvent[] = [];
  private filePath: string | null = null;

  constructor(filePath: string | null = null) {
    this.filePath = filePath;
  }

  setPath(path: string): void {
    this.filePath = path;
  }

  async append(event: TasteEvent): Promise<void> {
    this.events.push(event);
    if (this.events.length > MAX_EVENTS_IN_MEMORY) {
      this.events.shift(); // drop oldest from memory
    }

    if (this.filePath) {
      try {
        await ensureDirExists(dirname(this.filePath));
        await appendFile(this.filePath, `${JSON.stringify(event)}\n`, 'utf-8');
      } catch {
        // Non-fatal: log write failure should not crash the app
      }
    }
  }

  async appendMany(events: TasteEvent[]): Promise<void> {
    for (const event of events) {
      await this.append(event);
    }
  }

  /** Returns events from memory (tail). Load from disk for full history. */
  getRecentEvents(count = 50): TasteEvent[] {
    return this.events.slice(-count);
  }

  getAllEvents(): TasteEvent[] {
    return [...this.events];
  }

  async loadFromDisk(): Promise<void> {
    if (!this.filePath) return;
    try {
      const raw = await readFile(this.filePath, 'utf-8');
      const lines = raw.split('\n').filter(Boolean);
      this.events = lines.map(line => JSON.parse(line) as TasteEvent);
      this.tailIndex = this.events.length;
    } catch {
      this.events = [];
      this.tailIndex = 0;
    }
  }

  /** Read events from disk without loading into memory (useful for large logs) */
  async *readFromDisk(): AsyncGenerator<TasteEvent> {
    if (!this.filePath) return;
    if (!existsSync(this.filePath)) return;
    const raw = await readFile(this.filePath, 'utf-8');
    const lines = raw.split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        yield JSON.parse(line) as TasteEvent;
      } catch {
        // skip malformed lines
      }
    }
  }

  async count(): Promise<number> {
    if (!this.filePath) return this.events.length;
    try {
      const raw = await readFile(this.filePath, 'utf-8');
      return raw.split('\n').filter(Boolean).length;
    } catch {
      return this.events.length;
    }
  }

  clear(): void {
    this.events = [];
    this.tailIndex = 0;
  }

  getStats(): { inMemory: number } {
    return { inMemory: this.events.length };
  }
}

async function ensureDirExists(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}
