/**
 * SessionCatalogView — fullscreen catalog of every session clew can see:
 * supervisor-managed background sessions, in-process agents dispatched by this
 * session, and archived transcripts on disk.
 *
 * Layout and interaction model are ported from the prime-agent agents view:
 * a metadata header (version / model / cwd / agent counts / scope / depth), a
 * search prompt, and Running / Idle / Inactive sections whose rows nest their
 * subagents. → drills into an agent so its subagents become the top level, ←
 * returns to the parent scope.
 */

import { randomUUID, type UUID } from 'crypto';
import React from 'react';
import { getSessionId } from '../../bootstrap/state.js';
import { useMainLoopModel } from '../../hooks/useMainLoopModel.js';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
import { Box, Text, useInput } from '../../ink.js';
import { removeSession, startDaemonSession, stopSession } from '../../services/Supervisor/ipcClient.js';
import { useAppState, useSetAppState } from '../../state/AppState.js';
import { enterTeammateView } from '../../state/teammateViewHelpers.js';
import {
  appendMessageToLocalAgent,
  killAsyncAgent,
  queuePendingMessage,
} from '../../tasks/LocalAgentTask/LocalAgentTask.js';
import type { TaskState } from '../../tasks/types.js';
import { getSubscriptionName } from '../../utils/auth.js';
import { getCwd } from '../../utils/cwd.js';
import { createUserMessage } from '../../utils/messages.js';
import { renderModelSetting } from '../../utils/model/model.js';
import { getModeColor, permissionModeSymbol, permissionModeTitle } from '../../utils/permissions/PermissionMode.js';
import { saveCustomTitle } from '../../utils/sessionStorage.js';
import { Clawd } from '../LogoV2/Clawd.js';
import TextInput from '../TextInput.js';
import { matchSearchText, parseSearchQuery } from './sessionCatalogSearch.js';
import {
  loadSavedCatalogSessions,
  loadSupervisorSessions,
  localAgentTasksToSummaries,
} from './sessionCatalogSources.js';
import {
  buildCatalogIndex,
  buildCatalogRows,
  buildDisplayItems,
  type CatalogDisplayItem,
  type CatalogRow,
  type CatalogScopeFrame,
  type CatalogSelectionKey,
  countRowsBySection,
  filterCatalogSessions,
  formatCatalogCounts,
  formatHeartbeatBadge,
  formatSessionDuration,
  getCatalogDepth,
  getCatalogSelectionKey,
  getCatalogSessionTitle,
  hasCatalogChildren,
  reconcileCatalogSessions,
  resolveCatalogScopeFrames,
  resolveCatalogSelectionState,
  scopeToSessionSubtree,
  sectionTitle,
  shouldApplyScopeResolution,
  stepCatalogSelection,
  summaryForRecord,
  transitionCatalogScope,
} from './sessionCatalogState.js';
import type { CatalogSessionSummary, SavedCatalogSession, SessionCatalogSection } from './types.js';

const LIVE_POLL_INTERVAL_MS = 2000;
const DELETE_CONFIRM_DURATION_MS = 2000;
const STATUS_MESSAGE_DURATION_MS = 4500;
const WORKING_ICON_FRAMES = ['✻', '✽', '✢', '·'] as const;
const WORKING_ICON_INTERVAL_MS = 200;
const IDLE_ICON_FRAMES = ['◌', '○', '◌', '○'] as const;
const INACTIVE_ICON_FRAMES = ['·', '·', '·', '·'] as const;
const SEARCH_PROMPT_PLACEHOLDER = 'Search agents';
const PAGE_STEP_ROWS = 10;

type ComposerMode = 'reply' | 'rename' | 'new';

type Props = {
  /** Closes the view; the message is echoed into the transcript. */
  onDone: (result?: string) => void;
  /**
   * Resumes an archived session. The catalog does not implement resume itself —
   * /resume owns that flow (worktrees, cost state, model, agent definition) —
   * so the command wrapper hands the session id back to it.
   */
  onResume?: (sessionId: string) => void;
  /** Include sessions from every project directory, not just this one. */
  allProjects?: boolean;
  /** Show only the current conversation and subagents it dispatched. */
  currentSessionOnly?: boolean;
  /** Whether the main conversation is currently processing a turn. */
  mainIsWorking?: boolean;
};

function sectionColor(section: SessionCatalogSection): string | undefined {
  switch (section) {
    case 'running':
      return 'success';
    case 'idle':
      return 'warning';
    case 'inactive':
      return undefined;
    default: {
      const _exhaustive: never = section;
      return _exhaustive;
    }
  }
}

/** Right-align the age (and message count) column so the list reads as a table. */
function formatRowDetails(row: CatalogRow, now: number): string {
  const age = formatSessionDuration(row.summary, now);
  return row.section === 'inactive' && row.summary.messageCount > 0 ? `${row.summary.messageCount} · ${age}` : age;
}

function truncate(text: string, width: number): string {
  if (width <= 0) return '';
  return text.length <= width ? text : `${text.slice(0, Math.max(0, width - 1))}…`;
}

export function SessionCatalogView({
  onDone,
  onResume,
  allProjects = false,
  currentSessionOnly = false,
  mainIsWorking = false,
}: Props): React.ReactNode {
  const { columns, rows: terminalRows } = useTerminalSize();
  const setAppState = useSetAppState();
  const tasks = useAppState(state => state.tasks) as Record<string, TaskState>;
  const permissionMode = useAppState(state => state.toolPermissionContext.mode);
  const model = useMainLoopModel();
  const mountedAt = React.useRef(new Date().toISOString());

  const [live, setLive] = React.useState<CatalogSessionSummary[]>([]);
  const [saved, setSaved] = React.useState<SavedCatalogSession[]>([]);
  const [savedReady, setSavedReady] = React.useState(false);
  const [liveReady, setLiveReady] = React.useState(false);

  const [query, setQuery] = React.useState('');
  const [queryCursor, setQueryCursor] = React.useState(0);
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [selectionIdentity, setSelectionIdentity] = React.useState<string | undefined>(undefined);
  const [selectionKey, setSelectionKey] = React.useState<CatalogSelectionKey | undefined>(undefined);
  const [scopeFrames, setScopeFrames] = React.useState<CatalogScopeFrame[]>([]);
  const [expanded, setExpanded] = React.useState<ReadonlySet<string>>(new Set());
  const [programShown, setProgramShown] = React.useState<ReadonlySet<string>>(new Set());

  const [composerMode, setComposerMode] = React.useState<ComposerMode | null>(null);
  const [composerText, setComposerText] = React.useState('');
  const [composerCursor, setComposerCursor] = React.useState(0);
  const [composerTargetIdentity, setComposerTargetIdentity] = React.useState<string | undefined>(undefined);

  const [pendingDeleteIdentity, setPendingDeleteIdentity] = React.useState<string | undefined>(undefined);
  const [status, setStatus] = React.useState<{ text: string; tone: 'info' | 'error' } | undefined>(undefined);
  const [iconFrame, setIconFrame] = React.useState(0);
  const [now, setNow] = React.useState(() => Date.now());

  // ─── Data ───────────────────────────────────────────────────

  // Transcripts are the slow half of a refresh, so they load once (and on `r`)
  // while the supervisor roster polls.
  const refreshSaved = React.useCallback(async () => {
    if (currentSessionOnly) {
      setSaved([]);
      setSavedReady(true);
      return;
    }
    try {
      setSaved(await loadSavedCatalogSessions({ allProjects }));
    } finally {
      setSavedReady(true);
    }
  }, [allProjects, currentSessionOnly]);

  React.useEffect(() => {
    void refreshSaved();
  }, [refreshSaved]);

  React.useEffect(() => {
    if (currentSessionOnly) {
      setLive([]);
      setLiveReady(true);
      return;
    }
    let cancelled = false;
    const poll = async () => {
      const sessions = await loadSupervisorSessions().catch(() => [] as CatalogSessionSummary[]);
      if (cancelled) return;
      setLive(sessions);
      setLiveReady(true);
      setNow(Date.now());
    };
    void poll();
    const timer = setInterval(() => void poll(), LIVE_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [currentSessionOnly]);

  React.useEffect(() => {
    const timer = setInterval(
      () => setIconFrame(frame => (frame + 1) % WORKING_ICON_FRAMES.length),
      WORKING_ICON_INTERVAL_MS,
    );
    return () => clearInterval(timer);
  }, []);

  React.useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus(undefined), STATUS_MESSAGE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [status]);

  React.useEffect(() => {
    if (!pendingDeleteIdentity) return;
    const timer = setTimeout(() => setPendingDeleteIdentity(undefined), DELETE_CONFIRM_DURATION_MS);
    return () => clearTimeout(timer);
  }, [pendingDeleteIdentity]);

  const currentSession = React.useMemo<CatalogSessionSummary | undefined>(() => {
    if (!currentSessionOnly) return undefined;
    const sessionId = getSessionId();
    return {
      id: sessionId,
      sessionId,
      activeSessionId: sessionId,
      lifecycle: 'live',
      activity: mainIsWorking ? 'working' : 'idle',
      runtimeKind: 'top-level',
      sessionName: 'current session',
      summary: mainIsWorking ? 'working in this session' : 'ready for input',
      cwd: getCwd(),
      model,
      messageCount: 0,
      isStreaming: mainIsWorking,
      created: mountedAt.current,
      modified: mountedAt.current,
      source: 'supervisor',
    };
  }, [currentSessionOnly, mainIsWorking, model]);

  const records = React.useMemo(() => {
    const current = currentSession ? [currentSession] : [];
    return reconcileCatalogSessions(
      [...current, ...live, ...localAgentTasksToSummaries(tasks, getSessionId(), getCwd())],
      saved,
    );
  }, [currentSession, live, tasks, saved]);
  const index = React.useMemo(() => buildCatalogIndex(records), [records]);

  const scopeResolution = React.useMemo(
    () => resolveCatalogScopeFrames(records, scopeFrames, index),
    [records, scopeFrames, index],
  );

  // A scope whose session vanished must not trap an empty view — but only drop
  // it once both catalogs have actually loaded.
  React.useEffect(() => {
    if (scopeResolution.droppedFrames === 0) return;
    if (!shouldApplyScopeResolution(scopeResolution.droppedFrames, liveReady, savedReady)) return;
    setScopeFrames(scopeResolution.frames);
  }, [scopeResolution, liveReady, savedReady]);

  const scopeKey = scopeResolution.frames.at(-1)?.scope;
  const scopeRootSummary = scopeResolution.root ? summaryForRecord(scopeResolution.root) : undefined;

  const rows = React.useMemo(() => {
    const scoped = scopeToSessionSubtree(records, scopeKey, index);
    const parsed = parseSearchQuery(query);
    const filtered = query.trim()
      ? filterCatalogSessions(scoped, text => matchSearchText(text, parsed).matches)
      : scoped;
    return buildCatalogRows(filtered, expanded, programShown, scopeKey);
  }, [records, scopeKey, index, query, expanded, programShown]);

  const selection = resolveCatalogSelectionState(rows, selectedIndex, selectionIdentity, selectionKey);
  const activeIndex = selection.index;
  const selectedRow = rows[activeIndex];

  const rememberSelection = React.useCallback((row: CatalogRow | undefined, nextIndex: number) => {
    setSelectedIndex(nextIndex);
    setSelectionIdentity(row?.identity);
    setSelectionKey(row ? getCatalogSelectionKey(row.summary) : undefined);
  }, []);

  /**
   * Steps `count` selectable rows at once. State updates do not land between
   * iterations, so a page jump has to walk the rows in a single pass.
   */
  const moveSelection = React.useCallback(
    (delta: number, count = 1) => {
      let nextIndex = activeIndex;
      for (let step = 0; step < count; step++) {
        const candidate = stepCatalogSelection(rows, nextIndex, delta);
        if (candidate === nextIndex) break;
        nextIndex = candidate;
      }
      rememberSelection(rows[nextIndex], nextIndex);
    },
    [rows, activeIndex, rememberSelection],
  );

  // ─── Actions ────────────────────────────────────────────────

  const openRow = React.useCallback(
    async (row: CatalogRow) => {
      const summary = row.summary;
      if (row.kind === 'subagent-summary') {
        // The summary row is the expand affordance for its parent's subagents.
        setExpanded(previous => new Set([...previous, row.parentIdentity ?? row.identity]));
        return;
      }
      if (summary.source === 'task') {
        enterTeammateView(summary.id, setAppState);
        onDone(`Opened agent ${getCatalogSessionTitle(summary)}.`);
        return;
      }
      if (currentSessionOnly && summary.sessionId === getSessionId()) {
        onDone();
        return;
      }
      if (summary.source === 'supervisor') {
        setStatus({
          text: 'Background sessions run detached. Use /session to inspect the current session or /bg to start another.',
          tone: 'info',
        });
        return;
      }
      // Archived transcript: hand the session id to /resume rather than
      // reimplementing the restore path here.
      if (onResume) {
        onResume(summary.sessionId);
        return;
      }
      onDone(`Resume this session with: /resume ${summary.sessionId}`);
    },
    [currentSessionOnly, onDone, onResume, setAppState],
  );

  const drillIntoRow = React.useCallback(
    (row: CatalogRow) => {
      const key = getCatalogSelectionKey(row.summary);
      if (row.kind === 'subagent-summary') {
        setExpanded(previous => new Set([...previous, row.parentIdentity ?? row.identity]));
        return;
      }
      if (!hasCatalogChildren(records, key, index)) {
        setStatus({ text: 'This agent has no subagents to drill into.', tone: 'info' });
        return;
      }
      setScopeFrames(frames => transitionCatalogScope(frames, { type: 'push', scope: key }));
      rememberSelection(undefined, 0);
    },
    [records, index, rememberSelection],
  );

  const leaveScope = React.useCallback(() => {
    if (scopeFrames.length === 0) return false;
    const parent = scopeRootSummary;
    setScopeFrames(frames => transitionCatalogScope(frames, { type: 'back' }));
    if (parent) {
      setSelectionIdentity(undefined);
      setSelectionKey(getCatalogSelectionKey(parent));
    }
    return true;
  }, [scopeFrames.length, scopeRootSummary]);

  const deleteRow = React.useCallback(
    async (row: CatalogRow) => {
      const summary = row.summary;
      if (summary.source === 'task') {
        killAsyncAgent(summary.id, setAppState);
        setStatus({ text: `Stopped ${getCatalogSessionTitle(summary)}.`, tone: 'info' });
        return;
      }
      if (currentSessionOnly && summary.sessionId === getSessionId()) {
        setStatus({ text: 'The current conversation cannot be stopped from its own agent view.', tone: 'error' });
        return;
      }
      if (summary.source === 'supervisor') {
        const response = summary.lifecycle === 'live' ? await stopSession(summary.id) : await removeSession(summary.id);
        setStatus(
          response.ok
            ? {
                text: `${summary.lifecycle === 'live' ? 'Stopped' : 'Removed'} ${summary.id.slice(0, 8)}.`,
                tone: 'info',
              }
            : { text: response.error ?? 'Supervisor rejected the request', tone: 'error' },
        );
        setLive(await loadSupervisorSessions().catch(() => live));
        return;
      }
      // Archived transcripts are user data; deleting one is out of scope here.
      setStatus({ text: 'Archived transcripts can only be removed with /clear or on disk.', tone: 'error' });
    },
    [currentSessionOnly, setAppState, live],
  );

  const submitComposer = React.useCallback(
    async (text: string) => {
      const value = text.trim();
      const mode = composerMode;
      const target = rows.find(row => row.identity === composerTargetIdentity) ?? selectedRow;
      setComposerMode(null);
      setComposerText('');
      setComposerCursor(0);
      setComposerTargetIdentity(undefined);
      if (!value) return;

      if (mode === 'new') {
        const cwd = target?.summary.cwd ?? getCwd();
        const result = await startDaemonSession(randomUUID(), cwd, value);
        setStatus(
          'error' in result
            ? { text: result.error, tone: 'error' }
            : { text: `Started background session ${result.sessionId.slice(0, 8)} in ${cwd}.`, tone: 'info' },
        );
        setLive(await loadSupervisorSessions().catch(() => live));
        return;
      }

      if (!target) return;
      const summary = target.summary;

      if (mode === 'rename') {
        if (summary.source === 'task') {
          setStatus({ text: 'In-process agents are named by their dispatch prompt.', tone: 'error' });
          return;
        }
        try {
          await saveCustomTitle(summary.sessionId as UUID, value, summary.sessionFile);
          setStatus({ text: `Renamed to "${value}".`, tone: 'info' });
          await refreshSaved();
        } catch (error) {
          setStatus({ text: `Rename failed: ${(error as Error).message}`, tone: 'error' });
        }
        return;
      }

      // Reply
      if (summary.source !== 'task') {
        setStatus({
          text: 'Reply is available for in-process agents; use ctrl+n to start a background session instead.',
          tone: 'error',
        });
        return;
      }
      appendMessageToLocalAgent(summary.id, createUserMessage({ content: value }), setAppState);
      queuePendingMessage(summary.id, value, setAppState);
      setStatus({ text: `Sent to ${getCatalogSessionTitle(summary)}.`, tone: 'info' });
    },
    [composerMode, composerTargetIdentity, rows, selectedRow, setAppState, refreshSaved, live],
  );

  // ─── Input ──────────────────────────────────────────────────

  const composerActive = composerMode !== null;

  useInput(
    (input, key) => {
      if (key.escape) {
        if (composerActive) {
          setComposerMode(null);
          setComposerText('');
          setComposerTargetIdentity(undefined);
          return;
        }
        if (query) {
          setQuery('');
          setQueryCursor(0);
          return;
        }
        if (leaveScope()) return;
        onDone('Session catalog closed.');
        return;
      }
      if (composerActive) return;

      if (key.upArrow) {
        moveSelection(-1);
        return;
      }
      if (key.downArrow) {
        moveSelection(1);
        return;
      }
      if (key.pageUp) {
        moveSelection(-1, PAGE_STEP_ROWS);
        return;
      }
      if (key.pageDown) {
        moveSelection(1, PAGE_STEP_ROWS);
        return;
      }
      if (key.return) {
        if (selectedRow) void openRow(selectedRow);
        return;
      }
      // Arrows steer the scope only while the search box is empty; otherwise
      // they belong to the text cursor.
      if (key.rightArrow && !query) {
        if (selectedRow) drillIntoRow(selectedRow);
        return;
      }
      if (key.leftArrow && !query) {
        if (!leaveScope() && currentSessionOnly) onDone();
        return;
      }
      if (key.ctrl && input === 'n') {
        setComposerMode('new');
        setComposerTargetIdentity(selectedRow?.identity);
        return;
      }
      if (key.ctrl && input === 'r') {
        if (!selectedRow) return;
        setComposerMode('rename');
        setComposerText(getCatalogSessionTitle(selectedRow.summary));
        setComposerCursor(getCatalogSessionTitle(selectedRow.summary).length);
        setComposerTargetIdentity(selectedRow.identity);
        return;
      }
      if (key.ctrl && input === 'o') {
        if (!selectedRow) return;
        const parentIdentity = selectedRow.parentIdentity ?? selectedRow.identity;
        setProgramShown(previous => {
          const next = new Set(previous);
          if (next.has(parentIdentity)) next.delete(parentIdentity);
          else next.add(parentIdentity);
          return next;
        });
        setExpanded(previous => new Set([...previous, parentIdentity]));
        return;
      }
      if (key.ctrl && input === 'x') {
        if (!selectedRow) return;
        if (pendingDeleteIdentity !== selectedRow.identity) {
          setPendingDeleteIdentity(selectedRow.identity);
          return;
        }
        setPendingDeleteIdentity(undefined);
        void deleteRow(selectedRow);
        return;
      }
      if ((input === 'n' || (input === ' ' && !query)) && !query) {
        if (input === ' ' && !selectedRow) return;
        setComposerMode(input === 'n' ? 'new' : 'reply');
        setComposerTargetIdentity(selectedRow?.identity);
        return;
      }
      if (currentSessionOnly && input && !key.ctrl && !key.meta) {
        setComposerMode('new');
        setComposerText(input);
        setComposerCursor(input.length);
      }
    },
    { isActive: true },
  );

  // ─── Render ─────────────────────────────────────────────────

  // The agents view is a terminal dashboard, so use the available width. A
  // fixed max-width made long session names wrap/truncate too aggressively
  // and left the right half of wide terminals visually empty.
  const contentWidth = Math.max(48, columns - 2);
  const listHeight = Math.max(6, terminalRows - (currentSessionOnly ? 14 : 18));
  const displayItems = React.useMemo(() => buildDisplayItems(rows), [rows]);
  const selectedDisplayIndex = displayItems.findIndex(
    item => item.type === 'row' && item.row.identity === selectedRow?.identity,
  );
  const start = Math.max(
    0,
    Math.min(
      selectedDisplayIndex >= 0 ? selectedDisplayIndex - Math.floor(listHeight / 2) : 0,
      Math.max(0, displayItems.length - listHeight),
    ),
  );
  const visibleItems = displayItems.slice(start, start + listHeight);
  const hasMoreAbove = start > 0;
  const hasMoreBelow = start + listHeight < displayItems.length;
  const sectionCounts = countRowsBySection(rows);
  const visibleSection = visibleItems.find(item => item.type === 'row')?.row.section;
  const showStickySection = hasMoreAbove && visibleItems[0]?.type !== 'heading' && visibleSection;
  const visibleSectionHeadingIndex = showStickySection
    ? visibleItems.findIndex(item => item.type === 'heading' && item.section === visibleSection)
    : -1;
  const renderedItems = visibleSectionHeadingIndex > 0 ? visibleItems.slice(visibleSectionHeadingIndex) : visibleItems;

  const renderRow = (row: CatalogRow, isSelected: boolean): React.ReactNode => {
    const indent = '  '.repeat(row.depth);

    if (row.kind === 'subagent-code') {
      return (
        <Text key={row.identity} dimColor wrap="truncate">
          {indent} {row.code || ' '}
        </Text>
      );
    }

    if (row.kind === 'subagent-summary') {
      return (
        <Text key={row.identity} inverse={isSelected} dimColor wrap="truncate">
          {indent}▸ {row.title}
          {row.hasSpawnCode ? ' · ctrl+o show program' : ''}
        </Text>
      );
    }

    const pendingDelete = pendingDeleteIdentity === row.identity;
    const details = formatRowDetails(row, now);
    const heartbeat = formatHeartbeatBadge(row.heartbeat, now);
    const icon =
      row.section === 'running'
        ? WORKING_ICON_FRAMES[iconFrame]
        : row.section === 'idle'
          ? IDLE_ICON_FRAMES[iconFrame]
          : INACTIVE_ICON_FRAMES[iconFrame];
    const titleWidth = Math.max(
      8,
      contentWidth - indent.length - 2 - details.length - 2 - (heartbeat ? heartbeat.length + 1 : 0),
    );
    const title = pendingDelete
      ? `ctrl+x again to ${row.section === 'running' ? 'stop' : 'delete'} "${row.title}"`
      : row.summary.summary
        ? `${row.title} · ${row.summary.summary}`
        : row.title;

    return (
      <Box key={row.identity} flexDirection="row">
        <Text inverse={isSelected} color={pendingDelete ? 'error' : sectionColor(row.section)} wrap="truncate">
          {indent}
          {icon}{' '}
        </Text>
        {heartbeat ? (
          <Text inverse={isSelected} color="error">
            {heartbeat}{' '}
          </Text>
        ) : null}
        <Text
          inverse={isSelected}
          color={pendingDelete ? 'error' : undefined}
          bold={!pendingDelete && Boolean(row.summary.sessionName)}
          wrap="truncate"
        >
          {truncate(title, titleWidth).padEnd(titleWidth, ' ')}
        </Text>
        <Text inverse={isSelected} dimColor>
          {details.padStart(10, ' ')}
        </Text>
      </Box>
    );
  };

  const renderItem = (item: CatalogDisplayItem, key: number): React.ReactNode => {
    switch (item.type) {
      case 'spacer':
        return <Text key={`spacer-${key}`}> </Text>;
      case 'heading':
        return (
          <Text key={`heading-${item.section}`} bold color={sectionColor(item.section)}>
            {currentSessionOnly
              ? sectionTitle(item.section)
              : `${sectionTitle(item.section)} (${sectionCounts[item.section]})`}
          </Text>
        );
      case 'empty':
        return (
          <Text key={`empty-${item.section}`} dimColor>
            {'  '}No agents
          </Text>
        );
      case 'row':
        return renderRow(item.row, item.row.identity === selectedRow?.identity);
      default: {
        const _exhaustive: never = item;
        return _exhaustive;
      }
    }
  };

  const metadata: [string, string][] = [
    ['version', `v${MACRO.VERSION}`],
    ['model', renderModelSetting(model)],
    ['cwd', getCwd()],
    ['agents', formatCatalogCounts(rows)],
    ['scope', scopeRootSummary ? getCatalogSessionTitle(scopeRootSummary) : 'global'],
    ['depth', String(getCatalogDepth(scopeRootSummary))],
  ];

  const composerLabel =
    composerMode === 'rename'
      ? 'rename'
      : composerMode === 'new'
        ? 'new session'
        : composerMode === 'reply'
          ? `reply to ${selectedRow ? getCatalogSessionTitle(selectedRow.summary) : 'agent'}`
          : '';

  if (currentSessionOnly) {
    const providerLabel = getSubscriptionName();
    const permissionLabel =
      permissionMode === 'default' ? 'default permissions' : `${permissionModeTitle(permissionMode).toLowerCase()} on`;

    return (
      <Box flexDirection="column" width={contentWidth}>
        <Box flexDirection="row" marginBottom={1}>
          <Box width={12} justifyContent="center">
            <Clawd pose={mainIsWorking ? 'look-right' : 'default'} />
          </Box>
          <Box flexDirection="column" marginLeft={1}>
            <Text>
              <Text bold>Clew Code</Text> <Text dimColor>v{MACRO.VERSION}</Text>
            </Text>
            <Text dimColor>
              {providerLabel} · {renderModelSetting(model)}
            </Text>
            <Text dimColor wrap="truncate">
              {getCwd()}
            </Text>
            <Text>
              <Text color="warning">{sectionCounts.idle} awaiting input</Text>
              <Text dimColor> · </Text>
              <Text color="success">{sectionCounts.running} working</Text>
              <Text dimColor> · </Text>
              <Text>{sectionCounts.inactive} completed</Text>
            </Text>
          </Box>
        </Box>

        <Box marginBottom={1}>
          <Text dimColor wrap="truncate">
            Your conversation moved to the background — enter opens it · esc returns to it · ctrl+c twice quits
          </Text>
        </Box>

        <Box flexDirection="column" minHeight={listHeight}>
          {showStickySection ? (
            <Text dimColor>
              {'  '}↑ more · {sectionTitle(visibleSection)} ({sectionCounts[visibleSection]})
            </Text>
          ) : null}
          {renderedItems.map((item, itemIndex) => renderItem(item, start + itemIndex + visibleSectionHeadingIndex))}
          {hasMoreBelow ? <Text dimColor>{'  '}...</Text> : null}
        </Box>

        {status ? (
          <Text color={status.tone === 'error' ? 'error' : 'info'} wrap="truncate">
            {status.text}
          </Text>
        ) : null}

        <Box borderStyle="single" borderColor="subtle" borderLeft={false} borderRight={false} paddingX={0}>
          <Text bold>› </Text>
          {composerActive ? (
            <TextInput
              value={composerText}
              onChange={setComposerText}
              onSubmit={text => void submitComposer(text)}
              columns={Math.max(10, contentWidth - 2)}
              cursorOffset={composerCursor}
              onChangeCursorOffset={setComposerCursor}
              placeholder="Describe a task for a new session"
            />
          ) : (
            <Text dimColor>describe a task for a new session</Text>
          )}
        </Box>

        <Text dimColor wrap="truncate">
          <Text color={getModeColor(permissionMode)}>
            {permissionModeSymbol(permissionMode)} {permissionLabel}
          </Text>{' '}
          · enter to open · space to reply · ctrl+x to stop · ? for shortcuts
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width={contentWidth}>
      <Box flexDirection="row" justifyContent="space-between" marginBottom={1}>
        <Box flexDirection="column">
          <Text color="suggestion" bold>
            CLEW CODE / AGENTS
          </Text>
          <Text dimColor>Live session catalog · {scopeRootSummary ? 'scoped view' : 'global view'}</Text>
        </Box>
        <Text dimColor>{formatCatalogCounts(rows)}</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        {metadata.map(([label, value]) => (
          <Box key={label} flexDirection="row">
            <Text dimColor>{label.padEnd(8, ' ')}</Text>
            <Text wrap="truncate">{value}</Text>
          </Box>
        ))}
      </Box>

      <Box flexDirection="row" borderStyle="single" borderColor="gray" paddingX={1} marginBottom={1}>
        <Text bold color="suggestion">
          ›{' '}
        </Text>
        {composerActive ? (
          <>
            <Text color="suggestion">{composerLabel} </Text>
            <TextInput
              value={composerText}
              onChange={setComposerText}
              onSubmit={text => void submitComposer(text)}
              columns={Math.max(10, contentWidth - composerLabel.length - 4)}
              cursorOffset={composerCursor}
              onChangeCursorOffset={setComposerCursor}
              placeholder={composerMode === 'reply' ? 'Write a reply to this agent' : 'Describe the task'}
            />
          </>
        ) : (
          <TextInput
            value={query}
            onChange={text => {
              setQuery(text);
              // A new result set invalidates a positional selection.
              setSelectedIndex(0);
            }}
            columns={Math.max(10, contentWidth - 2)}
            cursorOffset={queryCursor}
            onChangeCursorOffset={setQueryCursor}
            placeholder={SEARCH_PROMPT_PLACEHOLDER}
          />
        )}
      </Box>

      <Box flexDirection="column" minHeight={listHeight}>
        {showStickySection ? (
          <Text dimColor>
            {'  '}↑ more · {sectionTitle(visibleSection)} ({sectionCounts[visibleSection]})
          </Text>
        ) : null}
        {rows.length === 0 ? (
          <Text dimColor>{query ? '  No sessions match your search.' : '  No sessions yet.'}</Text>
        ) : (
          renderedItems.map((item, itemIndex) => renderItem(item, start + itemIndex + visibleSectionHeadingIndex))
        )}
        {hasMoreBelow ? <Text dimColor>{'  '}...</Text> : null}
      </Box>

      {status ? (
        <Box marginTop={1}>
          <Text color={status.tone === 'error' ? 'error' : 'info'} wrap="truncate">
            {status.text}
          </Text>
        </Box>
      ) : null}

      <Box marginTop={1}>
        <Text dimColor wrap="truncate">
          › describe a task for a new session
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor wrap="truncate">
          ↑/↓ move · enter open · n new · space reply · ctrl+r rename · ctrl+x stop · esc close
        </Text>
      </Box>
    </Box>
  );
}
