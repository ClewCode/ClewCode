/**
 * One-time token store for Bridge v2 Remote Control.
 *
 * Tokens are generated as `clew-rt-<random-hex>` and stored hashed
 * (SHA-256) in `~/.clew/remote-tokens.json`. Each token can be
 * consumed once — after the remote connects, the token is marked
 * as used and cannot be reused.
 */

import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { TokenEntry } from './types.js';

const TOKEN_DIR = join(homedir(), '.clew');
const TOKEN_FILE = join(TOKEN_DIR, 'remote-tokens.json');

const DEFAULT_EXPIRY_MS = 24 * 60 * 60 * 1_000; // 24 hours

/** Prefix that identifies our generated tokens. */
const TOKEN_PREFIX = 'clew-rt-';

function ensureDir(): void {
  if (!existsSync(TOKEN_DIR)) {
    mkdirSync(TOKEN_DIR, { recursive: true });
  }
}

function readStore(): TokenEntry[] {
  try {
    if (!existsSync(TOKEN_FILE)) return [];
    const raw = readFileSync(TOKEN_FILE, 'utf-8');
    return JSON.parse(raw) as TokenEntry[];
  } catch {
    return [];
  }
}

function writeStore(entries: TokenEntry[]): void {
  ensureDir();
  writeFileSync(TOKEN_FILE, JSON.stringify(entries, null, 2), 'utf-8');
}

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw, 'utf-8').digest('hex');
}

function randomHex(length: number): string {
  const bytes = new Uint8Array(Math.ceil(length / 2));
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, length);
}

/**
 * Generate a new one-time token.
 * Returns the raw token (shown to user once) and the stored entry.
 */
export function generateToken(label?: string): { raw: string; entry: TokenEntry } {
  const raw = `${TOKEN_PREFIX}${randomHex(24)}`;
  const hash = hashToken(raw);
  const id = crypto.randomUUID();
  const now = Date.now();

  const entry: TokenEntry = {
    id,
    hash,
    label: label || `token-${id.slice(0, 8)}`,
    createdAt: now,
    consumedAt: null,
    expiresAt: now + DEFAULT_EXPIRY_MS,
  };

  const store = readStore();
  store.push(entry);
  writeStore(store);

  return { raw, entry };
}

/**
 * Validate and consume a token. Returns the TokenEntry if valid,
 * null if invalid or already consumed.
 */
export function consumeToken(raw: string): TokenEntry | null {
  if (!raw.startsWith(TOKEN_PREFIX)) return null;

  const hash = hashToken(raw);
  const store = readStore();
  const idx = store.findIndex(e => e.hash === hash);

  if (idx === -1) return null;
  const entry = store[idx]!;

  if (entry.consumedAt !== null) return null;
  if (entry.expiresAt !== null && Date.now() > entry.expiresAt) return null;

  // Mark consumed
  entry.consumedAt = Date.now();
  store[idx] = entry;
  writeStore(store);

  return entry;
}

/**
 * List all stored tokens (without exposing raw values).
 */
export function listTokens(): TokenEntry[] {
  return readStore();
}

/**
 * Revoke a token by ID (mark as consumed).
 */
export function revokeToken(id: string): boolean {
  const store = readStore();
  const idx = store.findIndex(e => e.id === id);
  if (idx === -1) return false;

  store[idx]!.consumedAt = Date.now();
  writeStore(store);
  return true;
}

/**
 * Get a single token entry by ID.
 */
function getToken(id: string): TokenEntry | undefined {
  return readStore().find(e => e.id === id);
}
