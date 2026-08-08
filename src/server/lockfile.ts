import envPaths from 'env-paths';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

const paths = envPaths('clew', { suffix: '' });
const LOCK_DIR = paths.data;
const LOCK_FILE = join(LOCK_DIR, 'server.lock');

export type ServerLockInfo = {
  pid: number;
  port: number;
  host: string;
  httpUrl: string;
  startedAt: number;
};

function readLock(): ServerLockInfo | null {
  if (!existsSync(LOCK_FILE)) return null;
  try {
    return JSON.parse(readFileSync(LOCK_FILE, 'utf-8')) as ServerLockInfo;
  } catch {
    return null;
  }
}

/** Returns the running server info, or null when no (live) lock exists. */
export function probeRunningServer(): ServerLockInfo | null {
  const lock = readLock();
  if (!lock) return null;
  // Consider a lock stale if the PID is no longer alive.
  try {
    process.kill(lock.pid, 0);
    return lock;
  } catch {
    return null;
  }
}

export function writeServerLock(info: ServerLockInfo): void {
  mkdirSync(LOCK_DIR, { recursive: true });
  writeFileSync(LOCK_FILE, JSON.stringify(info, null, 2), 'utf-8');
}

export function removeServerLock(): void {
  if (existsSync(LOCK_FILE)) rmSync(LOCK_FILE);
}
