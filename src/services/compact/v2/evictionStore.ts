/**
 * Auto-compact v2 — reversible context reduction.
 *
 * The legacy system could only *measure* the damage compaction did: it hashed
 * the tool signatures it dropped and counted how often the model re-fetched
 * them (`compact_regret_detected`), then nudged a buffer by 5k tokens. The
 * information itself was gone for good.
 *
 * Here every reduction writes what it removed to disk and leaves a one-line
 * stub carrying a short handle. The model can pull it back with the
 * ContextRestore tool. That single change is what lets the planner reduce
 * early and aggressively: a wrong eviction now costs one tool call instead of
 * an unrecoverable hole in the conversation.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getOriginalCwd, getSessionId } from '../../../bootstrap/state.js';
import { logError } from '../../../utils/log.js';
import { jsonStringify } from '../../../utils/slowOperations.js';
import type { ReducerName } from './types.js';

export interface EvictionRecord {
  /** Short, model-typable handle: `ev_<hash8>`. */
  handle: string;
  kind: 'tool_result' | 'message_range' | 'summary_source';
  /** Human/model readable: 'Read src/query.ts', 'Bash: bun test'. */
  label: string;
  tokens: number;
  reducer: ReducerName;
  turn: number;
}

export interface EvictionStore {
  /** Persist content and return its record. */
  put(entry: Omit<EvictionRecord, 'handle'>, content: string): EvictionRecord;
  /** Retrieve evicted content by handle, or undefined if unknown/unreadable. */
  get(handle: string): { record: EvictionRecord; content: string } | undefined;
  list(): EvictionRecord[];
  /** Tokens currently parked outside the context window. */
  parkedTokens(): number;
}

/** Stub text left in place of evicted content. */
export function evictionStub(record: EvictionRecord): string {
  return `[evicted: ${record.label} — ~${formatTokens(record.tokens)} tokens — restore with ContextRestore("${record.handle}")]`;
}

function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

/**
 * djb2 over the content plus a per-store counter. Content alone would collide
 * for identical tool results evicted at different turns, and the label alone
 * is not unique — the counter guarantees distinct handles either way.
 */
function makeHandle(content: string, seq: number): string {
  let h = 5381;
  for (let i = 0; i < content.length; i++) {
    h = (h * 33) ^ content.charCodeAt(i);
  }
  h = (h * 33) ^ seq;
  return `ev_${(h >>> 0).toString(36).padStart(6, '0').slice(0, 8)}`;
}

function defaultStoreDir(sessionId: string): string {
  // Required lazily: sessionStorage sits at the head of a large import chain
  // that loops back through tools.ts. Importing it at module scope would put
  // this file — and therefore ContextRestoreTool — inside that cycle.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getProjectDir } =
    require('../../../utils/sessionStorage.js') as typeof import('../../../utils/sessionStorage.js');
  return join(getProjectDir(getOriginalCwd()), `${sessionId}-evictions`);
}

/**
 * File-backed store. Content goes to one file per handle so restoring a single
 * eviction never reads the whole session's evicted history.
 */
export function createEvictionStore(opts?: { dir?: string; sessionId?: string }): EvictionStore {
  const sessionId = opts?.sessionId ?? getSessionId();
  const dir = opts?.dir ?? defaultStoreDir(sessionId);
  const records = new Map<string, EvictionRecord>();
  // Content is cached in memory too: the common case is a restore within the
  // same session, and re-reading from disk there buys nothing.
  const contents = new Map<string, string>();
  let seq = 0;

  function pathFor(handle: string): string {
    return join(dir, `${handle}.txt`);
  }

  return {
    put(entry, content) {
      const handle = makeHandle(content, seq++);
      const record: EvictionRecord = { ...entry, handle };
      records.set(handle, record);
      contents.set(handle, content);
      try {
        mkdirSync(dirname(pathFor(handle)), { recursive: true });
        writeFileSync(pathFor(handle), content, 'utf8');
        writeFileSync(join(dir, 'index.json'), jsonStringify([...records.values()]), 'utf8');
      } catch (err) {
        // Persistence is best-effort. The in-memory copy still serves restores
        // for this session; only cross-session restore is lost.
        logError(err);
      }
      return record;
    },
    get(handle) {
      const record = records.get(handle);
      if (!record) return undefined;
      const cached = contents.get(handle);
      if (cached !== undefined) return { record, content: cached };
      try {
        if (!existsSync(pathFor(handle))) return undefined;
        const content = readFileSync(pathFor(handle), 'utf8');
        contents.set(handle, content);
        return { record, content };
      } catch (err) {
        logError(err);
        return undefined;
      }
    },
    list() {
      return [...records.values()];
    },
    parkedTokens() {
      let total = 0;
      for (const r of records.values()) total += r.tokens;
      return total;
    },
  };
}

/** In-memory store for tests and for ephemeral forked agents. */
export function createMemoryEvictionStore(): EvictionStore {
  const records = new Map<string, EvictionRecord>();
  const contents = new Map<string, string>();
  let seq = 0;
  return {
    put(entry, content) {
      const handle = makeHandle(content, seq++);
      const record: EvictionRecord = { ...entry, handle };
      records.set(handle, record);
      contents.set(handle, content);
      return record;
    },
    get(handle) {
      const record = records.get(handle);
      const content = contents.get(handle);
      return record && content !== undefined ? { record, content } : undefined;
    },
    list() {
      return [...records.values()];
    },
    parkedTokens() {
      let total = 0;
      for (const r of records.values()) total += r.tokens;
      return total;
    },
  };
}
