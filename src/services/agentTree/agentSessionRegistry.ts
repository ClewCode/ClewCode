/**
 * Agent session tree — durable registry of every agent spawned under a
 * root session: main thread, subagents (Agent tool), teammates, background
 * tasks. States: running | needs-input | idle | inactive.
 *
 * One file per root session (`~/.clew/agent-tree/<rootSessionId>/sessions.json`),
 * so the tree survives TUI close and can be listed/attached on reopen.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getSessionId } from '../../bootstrap/state.js';
import { getClewConfigHomeDir } from '../../utils/envUtils.js';
import { jsonStringify } from '../../utils/slowOperations.js';

export type AgentLifecycleState = 'running' | 'needs-input' | 'idle' | 'inactive';
export type AgentKind = 'main' | 'subagent' | 'teammate' | 'background';

export interface AgentTreeEntry {
  /** Stable handle — survives restarts; doubles as durable-message-queue key. */
  id: string;
  /** Direct parent agent id (undefined for the main/root agent). */
  parentId?: string;
  /** Session id this tree is rooted at. */
  rootSessionId: string;
  name: string;
  kind: AgentKind;
  state: AgentLifecycleState;
  model?: string;
  createdAt: number;
  updatedAt: number;
}

/** Entries older than this in `running` are auto-demoted to `inactive` on read. */
const STALE_MS = 15 * 60_000;

function treeDir(rootSessionId: string): string {
  return join(treeHomeOverride ?? getClewConfigHomeDir(), 'agent-tree', rootSessionId);
}

let treeHomeOverride: string | undefined;

/** Test hook — redirect all tree persistence under a temp dir. */
export function setAgentTreeHomeOverrideForTests(dir?: string): void {
  treeHomeOverride = dir;
  cache = undefined;
}

function treeFile(rootSessionId: string): string {
  return join(treeDir(rootSessionId), 'sessions.json');
}

// ponytail: last-write-wins across processes (no lockfile) — single CLI process owns a session today; add proper-lockfile when tmux teammates write concurrently.
let cache: { rootSessionId: string; entries: Map<string, AgentTreeEntry> } | undefined;

function load(rootSessionId: string): Map<string, AgentTreeEntry> {
  if (cache?.rootSessionId === rootSessionId) return cache.entries;
  const entries = new Map<string, AgentTreeEntry>();
  try {
    const raw = existsSync(treeFile(rootSessionId)) ? readFileSync(treeFile(rootSessionId), 'utf8') : '[]';
    for (const e of JSON.parse(raw) as AgentTreeEntry[]) entries.set(e.id, e);
  } catch {
    // corrupt or unreadable → start fresh rather than fail every later call
  }
  cache = { rootSessionId, entries };
  return entries;
}

function persist(rootSessionId: string, entries: Map<string, AgentTreeEntry>): void {
  const path = treeFile(rootSessionId);
  try {
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, jsonStringify([...entries.values()], null, 2), 'utf8');
    renameSync(tmp, path);
  } catch {
    // best-effort persistence; in-memory copy still serves this process
  }
}

export function ensureMainAgentEntry(opts?: { rootSessionId?: string; model?: string }): AgentTreeEntry {
  const root = opts?.rootSessionId ?? getSessionId();
  const entries = load(root);
  const existing = entries.get('main');
  const now = Date.now();
  if (existing) {
    existing.state = existing.state === 'inactive' ? 'running' : existing.state;
    existing.updatedAt = now;
    if (opts?.model) existing.model = opts.model;
    persist(root, entries);
    return existing;
  }
  const entry: AgentTreeEntry = {
    id: 'main',
    rootSessionId: root,
    name: 'main',
    kind: 'main',
    state: 'running',
    model: opts?.model,
    createdAt: now,
    updatedAt: now,
  };
  entries.set(entry.id, entry);
  persist(root, entries);
  return entry;
}

export function registerAgentSpawned(spec: {
  id: string;
  parentId?: string;
  name: string;
  kind: AgentKind;
  model?: string;
  rootSessionId?: string;
}): AgentTreeEntry {
  const root = spec.rootSessionId ?? getSessionId();
  const entry: AgentTreeEntry = {
    id: spec.id,
    parentId: spec.parentId,
    rootSessionId: root,
    name: spec.name,
    kind: spec.kind,
    state: 'running',
    model: spec.model,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const entries = load(root);
  entries.set(entry.id, entry);
  persist(root, entries);
  return entry;
}

export function setAgentState(id: string, state: AgentLifecycleState, rootSessionId?: string): void {
  const root = rootSessionId ?? getSessionId();
  const entries = load(root);
  const entry = entries.get(id);
  if (!entry || entry.state === state) return;
  entry.state = state;
  entry.updatedAt = Date.now();
  persist(root, entries);
}

/** Mark idle when the passed value settles (promise or direct result). */
export async function markIdleWhenSettled(id: string, settled: unknown): Promise<void> {
  await Promise.resolve(settled).catch(() => {
    // intentionally ignored — state transition to idle happens regardless
  });
  setAgentState(id, 'idle');
}

/** Stale `running` entries collapse to `inactive` — a finished bg task that never reported back. */
function sweep(entries: Map<string, AgentTreeEntry>): void {
  const cutoff = Date.now() - STALE_MS;
  let dirty = false;
  for (const e of entries.values()) {
    if (e.state === 'running' && e.updatedAt < cutoff) {
      e.state = 'inactive';
      e.updatedAt = Date.now();
      dirty = true;
    }
  }
  if (dirty && cache) persist(cache.rootSessionId, entries);
}

export function getAgentTreeEntry(id: string, rootSessionId?: string): AgentTreeEntry | undefined {
  const root = rootSessionId ?? getSessionId();
  const entries = load(root);
  sweep(entries);
  return entries.get(id);
}

/** Full tree, ordered root-first then by creation time. */
export function listAgentTree(rootSessionId?: string): AgentTreeEntry[] {
  const root = rootSessionId ?? getSessionId();
  const entries = load(root);
  sweep(entries);
  return [...entries.values()].sort((a, b) =>
    a.kind === 'main' ? -1 : b.kind === 'main' ? 1 : a.createdAt - b.createdAt,
  );
}

/** Rendered ASCII tree with live token totals from the ledger. */
export function renderAgentTree(): string {
  const list = listAgentTree();
  if (list.length <= 1) return '';
  const lines = list.map(e => {
    const indent = e.parentId && e.parentId !== 'main' ? '  └─ ' : e.kind !== 'main' ? ' ├─ ' : '';
    return `${indent}${e.id} ${e.name} [${e.kind}] ${e.state}`;
  });
  return `\nAgents:\n${lines.join('\n')}`;
}

/** Test hook. */
export function resetAgentTreeCacheForTests(): void {
  cache = undefined;
}
