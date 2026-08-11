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
import { getCwd } from '../../utils/cwd.js';
import { createUserMessage } from '../../utils/messages.js';
import { renderModelSetting } from '../../utils/model/model.js';
import { saveCustomTitle } from '../../utils/sessionStorage.js';
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
const NEEDS_INPUT_ROW_ICON = '●';
const COMPLETED_ROW_ICON = '✓';
const SEARCH_PROMPT_PLACEHOLDER = 'Search sessions';
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

export function SessionCatalogView({ onDone, onResume, allProjects = false }: Props): React.ReactNode {
  const { columns, rows: terminalRows } = useTerminalSize();
  const setAppState = useSetAppState();
  const tasks = useAppState(state => state.tasks) as Record<string, TaskState>;
  const model = useMainLoopModel();

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
    try {
      setSaved(await loadSavedCatalogSessions({ allProjects }));
    } finally {
      setSavedReady(true);
    }
  }, [allProjects]);

  React.useEffect(() => {
    void refreshSaved();
  }, [refreshSaved]);

  React.useEffect(() => {
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
  }, []);

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

  const records = React.useMemo(
    () => reconcileCatalogSessions([...live, ...localAgentTasksToSummaries(tasks, getSessionId(), getCwd())], saved),
    [live, tasks, saved],
  );
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
      if (summary.source === 'supervisor') {
        setStatus({
          text: 'Background sessions run detached. Use /sessions to manage (stop/rename) or start a new session with /bg or /sessions → ctrl+n.',
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
    [onDone, onResume, setAppState],
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
    [setAppState, live],
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
        leaveScope();
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
      if (input === ' ' && !query) {
        if (!selectedRow) return;
        setComposerMode('reply');
        setComposerTargetIdentity(selectedRow.identity);
        return;
      }
    },
    { isActive: true },
  );

  // ─── Render ─────────────────────────────────────────────────

  const contentWidth = Math.max(48, Math.min(columns - 2, 120));
  const listHeight = Math.max(6, terminalRows - 16);
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
          ? NEEDS_INPUT_ROW_ICON
          : COMPLETED_ROW_ICON;
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
          <Text key={`heading-${item.section}`} bold>
            {sectionTitle(item.section)}
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

  return (
    <Box flexDirection="column" width={contentWidth}>
      <Box flexDirection="column" marginBottom={1}>
        {metadata.map(([label, value]) => (
          <Box key={label} flexDirection="row">
            <Text dimColor>{label.padEnd(8, ' ')}</Text>
            <Text wrap="truncate">{value}</Text>
          </Box>
        ))}
      </Box>

      <Box flexDirection="row" marginBottom={1}>
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
        {hasMoreAbove ? <Text dimColor>{'  '}...</Text> : null}
        {rows.length === 0 ? (
          <Text dimColor>{query ? '  No sessions match your search.' : '  No sessions yet.'}</Text>
        ) : (
          visibleItems.map((item, itemIndex) => renderItem(item, start + itemIndex))
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
          enter open · → drill in · ← back · space reply · ctrl+n new · ctrl+r rename · ctrl+x stop · ctrl+o program ·
          esc close
        </Text>
      </Box>
    </Box>
  );
}
