/**
 * Pure state for the session catalog: reconciliation, hierarchy, scoping,
 * filtering, row building, and selection. No I/O and no rendering, so the whole
 * model is unit-testable.
 *
 * Ported from the prime-agent agents view
 * (.reference/prime-agent/packages/coding-agent/src/modes/agents-view) onto
 * clew's own session sources.
 */

import { basename, resolve } from 'path';
import type { CatalogHeartbeat, CatalogSessionSummary, SavedCatalogSession, SessionCatalogSection } from './types.js';

/** Hard cap on spawn-code lines shown so a large program never floods the view. */
const MAX_SPAWN_CODE_LINES = 10;

export type CatalogSessionHeartbeat = {
  activeCount: number;
  nextRunAt?: string;
};

export type CatalogRecord = {
  live?: CatalogSessionSummary;
  saved?: SavedCatalogSession;
  /** Stable UI key: canonical transcript path, then session id, then runtime id. */
  identity: string;
  /** Alternate keys that restore selection as a session is persisted or reattached. */
  identityAliases: readonly string[];
  section: SessionCatalogSection;
  searchableText: string;
  heartbeat?: CatalogSessionHeartbeat;
};

export type CatalogScopeKey = {
  sessionId: string;
  activeSessionId?: string;
};

export type CatalogScopeFrame = {
  scope: CatalogScopeKey;
};

export type CatalogScopeAction = { type: 'push'; scope: CatalogScopeKey } | { type: 'back' };

export type CatalogScopeResolution = {
  frames: CatalogScopeFrame[];
  root?: CatalogRecord;
  droppedFrames: number;
};

export type CatalogRowKind = 'agent' | 'subagent-summary' | 'subagent' | 'subagent-code';

export type CatalogRow = {
  kind: CatalogRowKind;
  section: SessionCatalogSection;
  summary: CatalogSessionSummary;
  title: string;
  subtitle: string;
  statusLabel: string;
  depth: number;
  selectable: boolean;
  runningSubagentCount: number;
  /** Unique selection identity for this row. */
  identity: string;
  /** Identity of the agent row this row is nested under. */
  parentIdentity?: string;
  /** True when this row's subagents carry spawn code that can be revealed. */
  hasSpawnCode?: boolean;
  /** One source line of the spawn program, for "subagent-code" rows. */
  code?: string;
  record?: CatalogRecord;
  heartbeat?: CatalogSessionHeartbeat;
};

export type CatalogSelectionKey = {
  sessionId: string;
  activeSessionId?: string;
};

export type CatalogIndex = {
  byKey: Map<string, CatalogRecord>;
  childrenByParent: Map<CatalogRecord, CatalogRecord[]>;
};

// ─── Sections ─────────────────────────────────────────────────

/** Busy in any way — streaming, running tools/bash, or driving subagents. */
function isBusySummary(summary: CatalogSessionSummary): boolean {
  return Boolean(
    summary.isStreaming ||
      summary.isCompacting ||
      summary.isRunningTools ||
      summary.isBashRunning ||
      summary.hasRunningSubagents ||
      summary.hasActiveHeartbeat ||
      summary.activity === 'working',
  );
}

export function classifyCatalogSession(summary: CatalogSessionSummary): SessionCatalogSection {
  if (summary.lifecycle !== 'live') return 'inactive';
  return isBusySummary(summary) ? 'running' : 'idle';
}

export function classifyCatalogRecord(record: Pick<CatalogRecord, 'live' | 'heartbeat'>): SessionCatalogSection {
  if (!record.live) return 'inactive';
  if ((record.heartbeat?.activeCount ?? 0) > 0) return 'running';
  return classifyCatalogSession(record.live);
}

export function sectionTitle(section: SessionCatalogSection): string {
  switch (section) {
    case 'running':
      return 'Running';
    case 'idle':
      return 'Idle';
    case 'inactive':
      return 'Inactive';
    default: {
      const _exhaustive: never = section;
      return _exhaustive;
    }
  }
}

function sectionRank(section: SessionCatalogSection): number {
  switch (section) {
    case 'running':
      return 0;
    case 'idle':
      return 1;
    case 'inactive':
      return 2;
    default: {
      const _exhaustive: never = section;
      return _exhaustive;
    }
  }
}

// ─── Identity ─────────────────────────────────────────────────

function canonicalSessionPath(path: string): string {
  const resolved = resolve(path);
  // Windows paths are case-insensitive, so the same file must not produce two
  // identities depending on how the path was spelled.
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function fileIdentity(path: string): string {
  return `file:${canonicalSessionPath(path)}`;
}

function summaryIdentityAliases(summary: CatalogSessionSummary): string[] {
  return [
    summary.sessionFile ? fileIdentity(summary.sessionFile) : undefined,
    `session:${summary.sessionId}`,
    summary.activeSessionId ? `active:${summary.activeSessionId}` : undefined,
    `active:${summary.id}`,
  ].filter((identity): identity is string => identity !== undefined);
}

function savedIdentityAliases(saved: SavedCatalogSession): string[] {
  return [fileIdentity(saved.path), `session:${saved.id}`];
}

function getSummaryKeys(summary: CatalogSessionSummary): string[] {
  return [
    `active:${summary.activeSessionId ?? summary.id}`,
    `session:${summary.sessionId}`,
    summary.sessionFile ? fileIdentity(summary.sessionFile) : undefined,
  ].filter((key): key is string => key !== undefined);
}

function getParentKeys(summary: CatalogSessionSummary): string[] {
  return [
    summary.parentActiveSessionId ? `active:${summary.parentActiveSessionId}` : undefined,
    summary.parentSessionId ? `session:${summary.parentSessionId}` : undefined,
    summary.parentSessionPath ? fileIdentity(summary.parentSessionPath) : undefined,
  ].filter((key): key is string => key !== undefined);
}

export function getCatalogSummaryIdentity(summary: CatalogSessionSummary): string {
  if (summary.sessionFile) return fileIdentity(summary.sessionFile);
  if (summary.activeSessionId) return `active:${summary.activeSessionId}`;
  return `session:${summary.sessionId}`;
}

export function getCatalogSelectionKey(summary: CatalogSessionSummary): CatalogSelectionKey {
  return { sessionId: summary.sessionId, activeSessionId: summary.activeSessionId };
}

// ─── Reconciliation ───────────────────────────────────────────

function createSearchableText(live: CatalogSessionSummary | undefined, saved: SavedCatalogSession | undefined): string {
  return [
    live?.sessionId,
    live?.activeSessionId,
    live?.sessionName,
    live?.firstMessage,
    live?.cwd,
    live?.sessionFile,
    live?.summary,
    live?.model,
    saved?.id,
    saved?.name,
    saved?.firstMessage,
    saved?.allMessagesText,
    saved?.summary,
    saved?.cwd,
    saved?.path,
    saved?.parentSessionPath,
  ]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' ');
}

/**
 * Merge live sessions with the durable transcript catalog. Live data stays
 * authoritative; saved data only enriches durable and searchable fields, and
 * contributes rows of its own for sessions that are no longer running.
 */
export function reconcileCatalogSessions(
  liveSummaries: readonly CatalogSessionSummary[],
  savedSessions: readonly SavedCatalogSession[] = [],
  heartbeats: readonly CatalogHeartbeat[] = [],
): CatalogRecord[] {
  const heartbeatByActiveId = aggregateSessionHeartbeats(liveSummaries, heartbeats);
  const records: CatalogRecord[] = [];
  const recordByAlias = new Map<string, CatalogRecord>();

  for (const live of liveSummaries) {
    const aliases = summaryIdentityAliases(live);
    const heartbeat =
      heartbeatByActiveId.get(live.activeSessionId ?? live.id) ??
      (live.hasActiveHeartbeat ? { activeCount: 1 } : undefined);
    const record: CatalogRecord = {
      live: heartbeat && !live.hasActiveHeartbeat ? { ...live, hasActiveHeartbeat: true } : live,
      identity: aliases[0]!,
      identityAliases: aliases,
      section: 'idle',
      searchableText: createSearchableText(live, undefined),
      ...(heartbeat ? { heartbeat } : {}),
    };
    record.section = classifyCatalogRecord(record);
    records.push(record);
    for (const alias of aliases) recordByAlias.set(alias, record);
  }

  for (const saved of savedSessions) {
    const aliases = savedIdentityAliases(saved);
    const existing = aliases.map(alias => recordByAlias.get(alias)).find(Boolean);
    if (existing) {
      existing.saved = saved;
      existing.identityAliases = [...new Set([...existing.identityAliases, ...aliases])];
      existing.searchableText = createSearchableText(existing.live, saved);
      for (const alias of aliases) recordByAlias.set(alias, existing);
      continue;
    }
    const inactive: CatalogRecord = {
      saved,
      identity: aliases[0]!,
      identityAliases: aliases,
      section: 'inactive',
      searchableText: createSearchableText(undefined, saved),
    };
    records.push(inactive);
    for (const alias of aliases) recordByAlias.set(alias, inactive);
  }

  return records;
}

/** Collapse a merged record back to the single summary shape rows render from. */
export function summaryForRecord(record: CatalogRecord): CatalogSessionSummary {
  if (record.live) {
    const saved = record.saved;
    if (!saved) return record.live;
    return {
      ...record.live,
      sessionName: record.live.sessionName ?? saved.name,
      firstMessage: record.live.firstMessage ?? saved.firstMessage,
      summary: record.live.summary ?? saved.summary,
      sessionFile: record.live.sessionFile ?? canonicalSessionPath(saved.path),
      parentSessionPath: record.live.parentSessionPath ?? saved.parentSessionPath,
      depth: record.live.depth ?? saved.depth,
      messageCount: record.live.messageCount || saved.messageCount,
      created: record.live.created ?? saved.created.toISOString(),
      modified: record.live.modified ?? saved.modified.toISOString(),
    };
  }
  const saved = record.saved;
  if (!saved) throw new Error('Catalog record has no live or saved source');
  return {
    id: saved.id,
    sessionId: saved.id,
    sessionFile: canonicalSessionPath(saved.path),
    parentSessionPath: saved.parentSessionPath,
    lifecycle: 'archived',
    activity: 'idle',
    runtimeKind: saved.parentSessionPath ? 'subagent' : 'top-level',
    depth: saved.depth,
    sessionName: saved.name,
    firstMessage: saved.firstMessage,
    summary: saved.summary,
    cwd: saved.cwd,
    messageCount: saved.messageCount,
    taskState: saved.taskState,
    created: saved.created.toISOString(),
    modified: saved.modified.toISOString(),
    source: 'transcript',
  };
}

// ─── Index & hierarchy ────────────────────────────────────────

export function buildCatalogIndex(records: readonly CatalogRecord[]): CatalogIndex {
  const byKey = new Map<string, CatalogRecord>();
  for (const record of records) {
    for (const key of record.identityAliases) byKey.set(key, record);
  }
  const childrenByParent = new Map<CatalogRecord, CatalogRecord[]>();
  for (const record of records) {
    const parent = findParentRecord(record, byKey);
    if (!parent || parent === record) continue;
    const children = childrenByParent.get(parent) ?? [];
    children.push(record);
    childrenByParent.set(parent, children);
  }
  return { byKey, childrenByParent };
}

function findScopeRecord(scope: CatalogScopeKey, byKey: ReadonlyMap<string, CatalogRecord>): CatalogRecord | undefined {
  if (scope.activeSessionId) {
    const active = byKey.get(`active:${scope.activeSessionId}`);
    if (active) return active;
  }
  return byKey.get(`session:${scope.sessionId}`);
}

function findParentRecord(record: CatalogRecord, byKey: ReadonlyMap<string, CatalogRecord>): CatalogRecord | undefined {
  const liveKeys = record.live ? getParentKeys(record.live) : [];
  const savedKey = record.saved?.parentSessionPath ? fileIdentity(record.saved.parentSessionPath) : undefined;
  for (const key of savedKey ? [...liveKeys, savedKey] : liveKeys) {
    const parent = byKey.get(key);
    if (parent) return parent;
  }
  return undefined;
}

export function hasCatalogChildren(
  records: readonly CatalogRecord[],
  scope: CatalogScopeKey,
  index: CatalogIndex = buildCatalogIndex(records),
): boolean {
  const root = findScopeRecord(scope, index.byKey);
  return root !== undefined && (index.childrenByParent.get(root)?.length ?? 0) > 0;
}

export function getCatalogAncestorSessionIds(
  records: readonly CatalogRecord[],
  scope: CatalogScopeKey,
  index: CatalogIndex = buildCatalogIndex(records),
): string[] {
  const root = findScopeRecord(scope, index.byKey);
  if (!root) return [];
  const ancestors: string[] = [];
  const visited = new Set<CatalogRecord>([root]);
  let current = findParentRecord(root, index.byKey);
  while (current && !visited.has(current)) {
    visited.add(current);
    ancestors.unshift(summaryForRecord(current).sessionId);
    current = findParentRecord(current, index.byKey);
  }
  return ancestors;
}

// ─── Scope ────────────────────────────────────────────────────

export function transitionCatalogScope(
  frames: readonly CatalogScopeFrame[],
  action: CatalogScopeAction,
): CatalogScopeFrame[] {
  if (action.type === 'back') return frames.slice(0, -1);
  const nextFrame = { scope: action.scope };
  if (frames.at(-1)?.scope.sessionId !== action.scope.sessionId) return [...frames, nextFrame];
  return [...frames.slice(0, -1), nextFrame];
}

/** Drop scope frames whose session has disappeared, keeping the deepest survivor. */
export function resolveCatalogScopeFrames(
  records: readonly CatalogRecord[],
  frames: readonly CatalogScopeFrame[],
  index: CatalogIndex = buildCatalogIndex(records),
): CatalogScopeResolution {
  if (frames.length === 0) return { frames: [], droppedFrames: 0 };
  for (let frameIndex = frames.length - 1; frameIndex >= 0; frameIndex--) {
    const frame = frames[frameIndex]!;
    const root = findScopeRecord(frame.scope, index.byKey);
    if (!root) continue;
    return { frames: frames.slice(0, frameIndex + 1), root, droppedFrames: frames.length - frameIndex - 1 };
  }
  return { frames: [], droppedFrames: frames.length };
}

/**
 * A vanished scope must not permanently trap an empty view, but a scope that is
 * merely still loading must not be discarded either.
 */
export function shouldApplyScopeResolution(
  droppedFrames: number,
  liveCatalogReady: boolean,
  savedCatalogReady: boolean,
): boolean {
  return droppedFrames === 0 || (liveCatalogReady && savedCatalogReady);
}

/** Restrict records to the scoped root and every descendant of that root. */
export function scopeToSessionSubtree(
  records: readonly CatalogRecord[],
  scope: CatalogScopeKey | undefined,
  index: CatalogIndex = buildCatalogIndex(records),
): CatalogRecord[] {
  if (!scope) return [...records];
  const root = findScopeRecord(scope, index.byKey);
  if (!root) return [];
  const retained = new Set<CatalogRecord>();
  const queue = [root];
  for (let queueIndex = 0; queueIndex < queue.length; queueIndex++) {
    const current = queue[queueIndex]!;
    if (retained.has(current)) continue;
    retained.add(current);
    queue.push(...(index.childrenByParent.get(current) ?? []));
  }
  return records.filter(record => retained.has(record));
}

export function getCatalogDepth(scopeRoot: CatalogSessionSummary | undefined): number {
  return scopeRoot ? (scopeRoot.depth ?? 0) + 1 : 0;
}

// ─── Filtering ────────────────────────────────────────────────

export function filterCatalogSessions(
  records: readonly CatalogRecord[],
  matches: (searchableText: string) => boolean,
): CatalogRecord[] {
  const index = buildCatalogIndex(records);
  const retained = new Set<CatalogRecord>();
  for (const record of records) {
    if (!matches(record.searchableText)) continue;
    let current: CatalogRecord | undefined = record;
    while (current && !retained.has(current)) {
      retained.add(current);
      current = findParentRecord(current, index.byKey);
    }
  }
  // Keep catalog order and the original records so row ranking and sections stay
  // authoritative while ancestors only provide hierarchy for the matches.
  return records.filter(record => retained.has(record));
}

// ─── Heartbeats ───────────────────────────────────────────────

export function aggregateSessionHeartbeats(
  summaries: readonly CatalogSessionSummary[],
  heartbeats: readonly CatalogHeartbeat[],
): ReadonlyMap<string, CatalogSessionHeartbeat> {
  const summaryByKey = new Map<string, CatalogSessionSummary>();
  for (const summary of summaries) {
    for (const key of getSummaryKeys(summary)) summaryByKey.set(key, summary);
  }
  const jobIdsByOwner = new Map<string, Set<string>>();
  const nextRunByJob = new Map<string, string>();
  const add = (owner: string, jobId: string): void => {
    const ids = jobIdsByOwner.get(owner) ?? new Set<string>();
    ids.add(jobId);
    jobIdsByOwner.set(owner, ids);
  };

  for (const heartbeat of heartbeats) {
    const job = heartbeat.job;
    if (job.status !== 'active') continue;
    if (job.nextRunAt && Number.isFinite(Date.parse(job.nextRunAt))) nextRunByJob.set(job.id, job.nextRunAt);
    let summary = summaryByKey.get(`active:${job.activeSessionId}`);
    const visited = new Set<string>();
    if (!summary) add(job.activeSessionId, job.id);
    // A job on a subagent keeps every ancestor marked as running too.
    while (summary) {
      const owner = summary.activeSessionId ?? summary.id;
      if (visited.has(owner)) break;
      visited.add(owner);
      add(owner, job.id);
      summary = findParentSummary(summary, summaryByKey);
    }
  }

  const result = new Map<string, CatalogSessionHeartbeat>();
  for (const [owner, jobIds] of jobIdsByOwner) {
    const nextRunAt = [...jobIds]
      .map(jobId => nextRunByJob.get(jobId))
      .filter((value): value is string => value !== undefined)
      .sort((a, b) => Date.parse(a) - Date.parse(b))[0];
    result.set(owner, { activeCount: jobIds.size, ...(nextRunAt ? { nextRunAt } : {}) });
  }
  return result;
}

function findParentSummary(
  summary: CatalogSessionSummary,
  byKey: ReadonlyMap<string, CatalogSessionSummary>,
): CatalogSessionSummary | undefined {
  for (const key of getParentKeys(summary)) {
    const parent = byKey.get(key);
    if (parent) return parent;
  }
  return undefined;
}

export function formatHeartbeatBadge(heartbeat: CatalogSessionHeartbeat | undefined, now = Date.now()): string {
  if (!heartbeat || heartbeat.activeCount < 1) return '';
  const next = heartbeat.nextRunAt ? Date.parse(heartbeat.nextRunAt) : Number.NaN;
  const countdown = Number.isFinite(next) ? formatHeartbeatCountdown(next - now) : undefined;
  return `♥ ${heartbeat.activeCount}${countdown ? `·${countdown}` : ''}`;
}

function formatHeartbeatCountdown(durationMs: number): string {
  const seconds = Math.max(1, Math.round(Math.max(0, durationMs) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

// ─── Selection ────────────────────────────────────────────────

/**
 * Matches by identity, then activeSessionId, then sessionId: a row's identity
 * changes when a session is persisted or re-attached, so the latter two keys
 * re-find the same session across those transitions. Returns -1 when gone.
 */
export function resolveCatalogSelectionIndex(
  rows: readonly CatalogRow[],
  identity: string | undefined,
  key: CatalogSelectionKey | undefined,
): number {
  const findSelectable = (predicate: (row: CatalogRow) => boolean): number =>
    rows.findIndex(row => row.selectable && predicate(row));

  if (identity !== undefined) {
    const index = findSelectable(row => row.identity === identity);
    // Synthetic nested rows deliberately reuse their parent's session key, so
    // their exact row identity must win over the active-runtime fallback.
    if (index >= 0 && rows[index]?.kind !== 'agent') return index;
  }
  if (key?.activeSessionId !== undefined) {
    const activeSessionId = key.activeSessionId;
    const index = findSelectable(row => (row.summary.activeSessionId ?? row.summary.id) === activeSessionId);
    if (index >= 0) return index;
  }
  if (identity !== undefined) {
    const index = findSelectable(row => row.identity === identity);
    if (index >= 0) return index;
  }
  if (key?.sessionId !== undefined) {
    const sessionId = key.sessionId;
    return findSelectable(row => row.summary.sessionId === sessionId);
  }
  return -1;
}

export type CatalogSelectionResolution = {
  index: number;
  resolved: boolean;
};

export function resolveCatalogSelectionState(
  rows: readonly CatalogRow[],
  currentIndex: number,
  identity: string | undefined,
  key: CatalogSelectionKey | undefined,
): CatalogSelectionResolution {
  if (rows.length === 0) return { index: 0, resolved: false };
  const resolvedIndex = resolveCatalogSelectionIndex(rows, identity, key);
  if (resolvedIndex >= 0) return { index: resolvedIndex, resolved: true };
  const boundedIndex = Math.max(0, Math.min(currentIndex, rows.length - 1));
  if (rows[boundedIndex]?.selectable) return { index: boundedIndex, resolved: false };
  const firstSelectable = rows.findIndex(row => row.selectable);
  return { index: firstSelectable >= 0 ? firstSelectable : 0, resolved: false };
}

/** Step the selection to the next selectable row, skipping read-only code rows. */
export function stepCatalogSelection(rows: readonly CatalogRow[], from: number, delta: number): number {
  if (rows.length === 0 || delta === 0) return 0;
  let index = from;
  for (let step = 0; step < rows.length; step++) {
    index += delta;
    if (index < 0 || index >= rows.length) return from;
    if (rows[index]?.selectable) return index;
  }
  return from;
}

// ─── Rows ─────────────────────────────────────────────────────

function isRecord(value: CatalogSessionSummary | CatalogRecord): value is CatalogRecord {
  return 'identityAliases' in value;
}

function isSubagentSummary(summary: CatalogSessionSummary): boolean {
  if (summary.runtimeKind) return summary.runtimeKind === 'subagent';
  return Boolean(summary.parentActiveSessionId ?? summary.parentSessionId ?? summary.parentSessionPath);
}

function hasSpawnCode(summary: CatalogSessionSummary): boolean {
  return typeof summary.spawnCode === 'string' && summary.spawnCode.trim().length > 0;
}

function getTimestamp(value: string | undefined): number {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function getCatalogSessionTitle(summary: CatalogSessionSummary): string {
  const candidates = [
    summary.sessionName,
    summary.firstMessage,
    summary.cwd ? basename(summary.cwd) : undefined,
    summary.sessionId,
    summary.id,
  ];
  for (const candidate of candidates) {
    const normalized = candidate?.replace(/\s+/g, ' ').trim();
    if (normalized) return normalized;
  }
  return 'Untitled agent';
}

export function getCatalogSessionSubtitle(summary: CatalogSessionSummary): string {
  return [summary.model, summary.cwd, summary.activeSessionId ?? summary.id]
    .filter((part): part is string => part !== undefined && part.length > 0)
    .join('  ');
}

export function getCatalogStatusLabel(
  summary: CatalogSessionSummary,
  hasActiveHeartbeat = summary.hasActiveHeartbeat,
): string {
  if (summary.isCompacting) return 'compacting';
  if (summary.isStreaming) return summary.isRunningTools ? 'running tools' : 'thinking';
  // These all classify the session as Running, so the label must agree with the
  // section rather than claiming the session needs input.
  if (summary.isRunningTools) return 'running tools';
  if (summary.isBashRunning) return 'running bash';
  if (summary.hasRunningSubagents) return 'subagents running';
  if ((summary.queuedCount ?? 0) > 0) return `${summary.queuedCount} queued`;
  if (summary.lifecycle === 'archived') return 'archived';
  if (hasActiveHeartbeat) return 'heartbeat active';
  if (summary.activity === 'working') return 'working';
  switch (summary.taskState) {
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'stopped':
      return 'stopped';
    default:
      return 'needs input';
  }
}

function compareCatalogRows(a: CatalogRow, b: CatalogRow): number {
  const sectionDiff = sectionRank(a.section) - sectionRank(b.section);
  if (sectionDiff !== 0) return sectionDiff;
  const createdDiff = getTimestamp(b.summary.created) - getTimestamp(a.summary.created);
  if (createdDiff !== 0) return createdDiff;
  const titleDiff = a.title.localeCompare(b.title);
  if (titleDiff !== 0) return titleDiff;
  return a.summary.sessionId.localeCompare(b.summary.sessionId);
}

function buildRowKeyMap(rows: readonly CatalogRow[]): Map<string, CatalogRow> {
  const rowsByKey = new Map<string, CatalogRow>();
  for (const row of rows) {
    for (const key of getSummaryKeys(row.summary)) rowsByKey.set(key, row);
  }
  return rowsByKey;
}

function findParentRow(
  summary: CatalogSessionSummary,
  rowsByKey: ReadonlyMap<string, CatalogRow>,
): CatalogRow | undefined {
  for (const key of getParentKeys(summary)) {
    const row = rowsByKey.get(key);
    if (row) return row;
  }
  return undefined;
}

/** A running subagent keeps every ancestor row in the Running section. */
function propagateRunningToAncestors(
  rows: readonly CatalogRow[],
  parentByChild: ReadonlyMap<CatalogRow, CatalogRow>,
): void {
  for (const row of rows) {
    if (!row.summary.hasActiveHeartbeat && row.section !== 'running') continue;
    const visited = new Set<CatalogRow>([row]);
    let ancestor = parentByChild.get(row);
    while (ancestor && !visited.has(ancestor)) {
      visited.add(ancestor);
      if (row.summary.hasActiveHeartbeat) {
        ancestor.section = 'running';
        ancestor.statusLabel = getCatalogStatusLabel(ancestor.summary, true);
      }
      ancestor = parentByChild.get(ancestor);
    }
  }
}

function createSubagentSummaryRow(
  parent: CatalogRow,
  children: readonly CatalogRow[],
  depth: number,
  hasSpawnCodeInGroup: boolean,
): CatalogRow {
  const totalCount = children.length;
  const running = parent.runningSubagentCount;
  const heartbeatCount = children.filter(
    child => child.summary.hasActiveHeartbeat || (child.heartbeat?.activeCount ?? 0) > 0,
  ).length;
  // Finished subagents stay reachable through the summary row even when nothing
  // is running anymore.
  const subagentTitle =
    running > 0
      ? `${running} ${running === 1 ? 'subagent' : 'subagents'} running`
      : `${totalCount} ${totalCount === 1 ? 'subagent' : 'subagents'}`;
  const title =
    heartbeatCount > 0
      ? `${subagentTitle} · ${heartbeatCount} ${heartbeatCount === 1 ? 'heartbeat' : 'heartbeats'} active`
      : subagentTitle;
  return {
    kind: 'subagent-summary',
    section: parent.section,
    summary: parent.summary,
    title,
    subtitle: '',
    statusLabel: '',
    depth,
    selectable: true,
    runningSubagentCount: running,
    identity: `subagents:${parent.identity}`,
    parentIdentity: parent.identity,
    hasSpawnCode: hasSpawnCodeInGroup,
  };
}

type SpawnCodeGroup = {
  /** Shared spawn program for this group, or undefined when unavailable. */
  spawnCode?: string;
  children: CatalogRow[];
};

/**
 * Subagents dispatched by the same program share its source; group them so each
 * program renders once, above the subagents it launched. Insertion order follows
 * each program's first subagent so groups read top-to-bottom in spawn order.
 */
function groupChildrenBySpawnCode(children: readonly CatalogRow[]): SpawnCodeGroup[] {
  const NO_CODE_KEY = ' no-spawn-code';
  const groups = new Map<string, SpawnCodeGroup>();
  for (const child of children) {
    const code = hasSpawnCode(child.summary) ? child.summary.spawnCode : undefined;
    const key = code ?? NO_CODE_KEY;
    const group = groups.get(key);
    if (group) {
      group.children.push(child);
    } else {
      groups.set(key, { spawnCode: code, children: [child] });
    }
  }
  return [...groups.values()];
}

function buildSpawnCodeRows(parent: CatalogRow, spawnCode: string, depth: number, groupIndex: number): CatalogRow[] {
  const makeRow = (code: string, lineIndex: string): CatalogRow => ({
    kind: 'subagent-code',
    section: parent.section,
    summary: parent.summary,
    title: '',
    subtitle: '',
    statusLabel: '',
    depth,
    // Code rows are read-only context; selection skips over them.
    selectable: false,
    runningSubagentCount: 0,
    identity: `code:${parent.identity}:${groupIndex}:${lineIndex}`,
    parentIdentity: parent.identity,
    code,
  });
  const allLines = spawnCode.replace(/\s+$/, '').split('\n');
  // Cap the body so a long program cannot flood the view; note the remainder.
  const lines = allLines.slice(0, MAX_SPAWN_CODE_LINES).map((line, i) => makeRow(line, String(i)));
  const hidden = allLines.length - lines.length;
  if (hidden > 0) {
    lines.push(makeRow(`… +${hidden} more ${hidden === 1 ? 'line' : 'lines'}`, 'more'));
  }
  return lines;
}

/**
 * Flatten records into the rendered row list: top-level agents sorted by
 * section then recency, each with either a collapsed "N subagents" summary row
 * or its expanded subagent subtree.
 */
export function buildCatalogRows(
  input: readonly (CatalogSessionSummary | CatalogRecord)[],
  expandedSubagentParents: ReadonlySet<string> = new Set(),
  programShownParents: ReadonlySet<string> = new Set(),
  scope?: CatalogScopeKey,
): CatalogRow[] {
  const inputs = input.map(value =>
    isRecord(value) ? { summary: summaryForRecord(value), record: value } : { summary: value, record: undefined },
  );
  const scopeRoot = scope
    ? inputs.find(
        ({ summary }) =>
          summary.sessionId === scope.sessionId ||
          (scope.activeSessionId !== undefined && summary.activeSessionId === scope.activeSessionId),
      )
    : undefined;
  const scopeRootKeys = new Set(
    scopeRoot ? (scopeRoot.record?.identityAliases ?? getSummaryKeys(scopeRoot.summary)) : [],
  );
  // Direct children of the scope root become the new top-level agents.
  const isDirectScopeChild = (summary: CatalogSessionSummary): boolean =>
    scopeRoot !== undefined && getParentKeys(summary).some(key => scopeRootKeys.has(key));

  const baseRows = inputs.map(
    ({ summary, record }): CatalogRow => ({
      kind: isSubagentSummary(summary) && !isDirectScopeChild(summary) ? 'subagent' : 'agent',
      section: record?.section ?? classifyCatalogSession(summary),
      summary,
      title: getCatalogSessionTitle(summary),
      subtitle: getCatalogSessionSubtitle(summary),
      statusLabel: getCatalogStatusLabel(summary),
      depth: 0,
      selectable: true,
      runningSubagentCount: 0,
      identity: record?.identity ?? getCatalogSummaryIdentity(summary),
      ...(record ? { record, heartbeat: record.heartbeat } : {}),
    }),
  );

  const rowsByKey = buildRowKeyMap(baseRows);
  const childrenByParent = new Map<CatalogRow, CatalogRow[]>();
  const parentByChild = new Map<CatalogRow, CatalogRow>();
  const nestedRows = new Set<CatalogRow>();

  for (const row of baseRows) {
    if (row.kind !== 'subagent') continue;
    const parent = findParentRow(row.summary, rowsByKey);
    if (!parent || parent === row) {
      // Catalogs stream progressively, so a child can arrive before its parent.
      // Keep it reachable as a root until the parent record appears.
      row.kind = 'agent';
      continue;
    }
    nestedRows.add(row);
    parentByChild.set(row, parent);
    if (row.section === 'running') parent.runningSubagentCount += 1;
    const siblings = childrenByParent.get(parent) ?? [];
    siblings.push(row);
    childrenByParent.set(parent, siblings);
  }
  propagateRunningToAncestors(baseRows, parentByChild);

  const roots = baseRows.filter(row => !nestedRows.has(row));
  const flattened: CatalogRow[] = [];
  const emit = (row: CatalogRow, depth: number): void => {
    row.depth = depth;
    flattened.push(row);
    const children = childrenByParent.get(row) ?? [];
    if (children.length === 0) return;
    const childHasSpawnCode = children.some(child => hasSpawnCode(child.summary));
    if (!expandedSubagentParents.has(row.identity)) {
      flattened.push(createSubagentSummaryRow(row, children, depth + 1, childHasSpawnCode));
      return;
    }
    const showProgram = programShownParents.has(row.identity);
    const groups = groupChildrenBySpawnCode([...children].sort(compareCatalogRows));
    for (const [groupIndex, group] of groups.entries()) {
      if (showProgram && group.spawnCode) {
        for (const codeRow of buildSpawnCodeRows(row, group.spawnCode, depth + 1, groupIndex)) {
          flattened.push(codeRow);
        }
      }
      for (const child of group.children) {
        child.parentIdentity = row.identity;
        emit(child, depth + 1);
      }
    }
  };

  const scopedRootRow = scopeRoot ? baseRows.find(row => row.summary === scopeRoot.summary) : undefined;
  const visibleRoots = scopedRootRow ? roots.filter(row => row !== scopedRootRow) : roots;
  for (const root of visibleRoots.sort(compareCatalogRows)) emit(root, 0);
  return flattened;
}

// ─── Display list ─────────────────────────────────────────────

export type CatalogDisplayItem =
  | { type: 'spacer' }
  | { type: 'heading'; section: SessionCatalogSection }
  | { type: 'empty'; section: SessionCatalogSection }
  | { type: 'row'; row: CatalogRow };

/**
 * Nested rows (subagent summaries and expanded subagents) always render inside
 * their top-level agent's section block, regardless of their own section.
 */
export function getDisplayRowsForSection(rows: readonly CatalogRow[], section: SessionCatalogSection): CatalogRow[] {
  const result: CatalogRow[] = [];
  let include = false;
  for (const row of rows) {
    if (row.depth === 0) include = row.section === section;
    if (include) result.push(row);
  }
  return result;
}

export function buildDisplayItems(rows: readonly CatalogRow[]): CatalogDisplayItem[] {
  const items: CatalogDisplayItem[] = [];
  const sections: SessionCatalogSection[] = ['running', 'idle', 'inactive'];
  for (const [index, section] of sections.entries()) {
    if (index > 0) items.push({ type: 'spacer' });
    items.push({ type: 'heading', section });
    const sectionRows = getDisplayRowsForSection(rows, section);
    if (sectionRows.length === 0) {
      items.push({ type: 'empty', section });
      continue;
    }
    for (const row of sectionRows) items.push({ type: 'row', row });
  }
  return items;
}

export function countRowsBySection(rows: readonly CatalogRow[]): Record<SessionCatalogSection, number> {
  const agents = rows.filter(row => row.kind === 'agent');
  return {
    running: agents.filter(row => row.section === 'running').length,
    idle: agents.filter(row => row.section === 'idle').length,
    inactive: agents.filter(row => row.section === 'inactive').length,
  };
}

export function formatCatalogCounts(rows: readonly CatalogRow[]): string {
  const counts = countRowsBySection(rows);
  return `${counts.running} running, ${counts.idle} idle, ${counts.inactive} inactive`;
}

// ─── Time ─────────────────────────────────────────────────────

export function formatCatalogRelativeTime(value: string | undefined, now: number = Date.now()): string {
  if (!value) return '';
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return '';
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** Live rows age from when they started; archived rows from their last write. */
export function formatSessionDuration(summary: CatalogSessionSummary, now: number = Date.now()): string {
  return formatCatalogRelativeTime(
    summary.activeSessionId ? (summary.created ?? summary.modified) : (summary.modified ?? summary.created),
    now,
  );
}
