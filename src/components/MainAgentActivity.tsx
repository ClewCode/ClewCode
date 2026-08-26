import * as React from 'react';
import { getSessionId } from '../bootstrap/state.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { Box, Text } from '../ink.js';
import { useAppState } from '../state/AppState.js';
import type { TaskState } from '../tasks/types.js';
import { getCwd } from '../utils/cwd.js';
import {
  loadSavedCatalogSessions,
  loadSupervisorSessions,
  localAgentTasksToSummaries,
} from './sessionCatalog/sessionCatalogSources.js';
import type { CatalogRecord } from './sessionCatalog/sessionCatalogState.js';
import {
  getCatalogSessionTitle,
  getCatalogStatusLabel,
  reconcileCatalogSessions,
  summaryForRecord,
} from './sessionCatalog/sessionCatalogState.js';
import type { CatalogSessionSummary, SavedCatalogSession, SessionCatalogSection } from './sessionCatalog/types.js';

const LIVE_POLL_INTERVAL_MS = 3000;
const CLOCK_INTERVAL_MS = 1000;
const ANIMATION_INTERVAL_MS = 220;
const MAX_VISIBLE_ROWS = 7;
const MAX_ARCHIVED_SESSIONS = 24;
const SECTION_ORDER: readonly SessionCatalogSection[] = ['idle', 'running', 'inactive'];
const WORKING_FRAMES = ['✻', '✽', '✢', '·'] as const;
const WAITING_FRAMES = ['◌', '○'] as const;

export type MainAgentActivityRow = {
  identity: string;
  section: SessionCatalogSection;
  title: string;
  detail: string;
  timestamp: number;
  summary: CatalogSessionSummary;
};

export type MainAgentActivityModel = {
  counts: Record<SessionCatalogSection, number>;
  rows: MainAgentActivityRow[];
};

function timestampOf(summary: CatalogSessionSummary): number {
  const value = summary.modified ?? summary.created;
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function rowDetail(summary: CatalogSessionSummary): string {
  if (summary.sessionName === 'current session') {
    return summary.activity === 'working' ? 'working in this session' : 'send a prompt to start';
  }
  return summary.summary?.trim() || getCatalogStatusLabel(summary);
}

/** Build the small welcome-page roster without exposing the catalog's interactive state. */
export function buildMainAgentActivityModel(
  records: readonly CatalogRecord[],
  maxRows = MAX_VISIBLE_ROWS,
): MainAgentActivityModel {
  const counts: Record<SessionCatalogSection, number> = { running: 0, idle: 0, inactive: 0 };
  const bySection: Record<SessionCatalogSection, MainAgentActivityRow[]> = {
    running: [],
    idle: [],
    inactive: [],
  };

  for (const record of records) {
    const summary = summaryForRecord(record);
    counts[record.section]++;
    bySection[record.section].push({
      identity: record.identity,
      section: record.section,
      title: getCatalogSessionTitle(summary),
      detail: rowDetail(summary),
      timestamp: timestampOf(summary),
      summary,
    });
  }

  for (const section of SECTION_ORDER) {
    bySection[section].sort((a, b) => b.timestamp - a.timestamp || a.title.localeCompare(b.title));
  }

  const rows: MainAgentActivityRow[] = [];
  // Take one row from each section per pass so a long archived or waiting
  // list can never hide a currently working agent from the compact roster.
  for (let offset = 0; rows.length < maxRows; offset++) {
    let added = false;
    for (const section of SECTION_ORDER) {
      const row = bySection[section][offset];
      if (!row) continue;
      rows.push(row);
      added = true;
      if (rows.length >= maxRows) break;
    }
    if (!added) break;
  }

  return { counts, rows };
}

function truncate(value: string, width: number): string {
  if (width <= 0) return '';
  return value.length <= width ? value : `${value.slice(0, Math.max(0, width - 1))}…`;
}

function formatAge(timestamp: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function sectionLabel(section: SessionCatalogSection): string {
  switch (section) {
    case 'idle':
      return 'Needs input';
    case 'running':
      return 'Working';
    case 'inactive':
      return 'Completed';
  }
}

function statusIcon(section: SessionCatalogSection, frame: number): string {
  switch (section) {
    case 'running':
      return WORKING_FRAMES[frame % WORKING_FRAMES.length];
    case 'idle':
      return WAITING_FRAMES[frame % WAITING_FRAMES.length];
    case 'inactive':
      return '·';
  }
}

function statusColor(section: SessionCatalogSection): 'success' | 'warning' | undefined {
  if (section === 'running') return 'success';
  if (section === 'idle') return 'warning';
  return undefined;
}

export const MainAgentActivity = React.memo(function MainAgentActivity({
  isMainWorking,
}: {
  isMainWorking: boolean;
}): React.ReactNode {
  const { columns } = useTerminalSize();
  const tasks = useAppState(state => state.tasks) as Record<string, TaskState>;
  const sessionId = getSessionId();
  const mountedAt = React.useRef(Date.now());
  const [live, setLive] = React.useState<CatalogSessionSummary[]>([]);
  const [saved, setSaved] = React.useState<SavedCatalogSession[]>([]);
  const [now, setNow] = React.useState(Date.now());
  const [frame, setFrame] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    void loadSavedCatalogSessions({ limit: MAX_ARCHIVED_SESSIONS })
      .then(value => {
        if (!cancelled) setSaved(value);
      })
      .catch(() => {
        // The live roster and current-session tasks still make a useful panel
        // when the durable transcript index is temporarily unavailable.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const value = await loadSupervisorSessions().catch(() => [] as CatalogSessionSummary[]);
      if (!cancelled) setLive(value);
    };
    void poll();
    const timer = setInterval(() => void poll(), LIVE_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  React.useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), CLOCK_INTERVAL_MS);
    return () => clearInterval(clock);
  }, []);

  const currentSession = React.useMemo<CatalogSessionSummary>(
    () => ({
      id: sessionId,
      sessionId,
      activeSessionId: sessionId,
      lifecycle: 'live',
      activity: isMainWorking ? 'working' : 'idle',
      runtimeKind: 'top-level',
      sessionName: 'current session',
      cwd: getCwd(),
      messageCount: 0,
      isStreaming: isMainWorking,
      created: new Date(mountedAt.current).toISOString(),
      modified: new Date(mountedAt.current).toISOString(),
      source: 'supervisor',
    }),
    [isMainWorking, sessionId],
  );

  const records = React.useMemo(() => {
    const otherLive = live.filter(item => item.sessionId !== sessionId && item.id !== sessionId);
    return reconcileCatalogSessions(
      [currentSession, ...otherLive, ...localAgentTasksToSummaries(tasks, sessionId, getCwd())],
      saved,
    );
  }, [currentSession, live, saved, sessionId, tasks]);
  const model = React.useMemo(() => buildMainAgentActivityModel(records), [records]);
  const hasWorking = model.counts.running > 0;

  React.useEffect(() => {
    if (!hasWorking) return;
    const animation = setInterval(() => setFrame(value => value + 1), ANIMATION_INTERVAL_MS);
    return () => clearInterval(animation);
  }, [hasWorking]);

  const titleWidth = Math.max(18, Math.min(34, Math.floor(columns * 0.28)));
  const detailWidth = Math.max(12, columns - titleWidth - 16);

  return (
    <Box flexDirection="column" marginTop={1} marginLeft={1} width="100%">
      <Text bold>
        AGENTS{'  '}
        <Text color="warning">{model.counts.idle} needs input</Text>
        <Text dimColor> · </Text>
        <Text color="success">{model.counts.running} working</Text>
        <Text dimColor> · {model.counts.inactive} completed</Text>
      </Text>
      {SECTION_ORDER.map(section => {
        const rows = model.rows.filter(row => row.section === section);
        if (rows.length === 0) return null;
        return (
          <Box key={section} flexDirection="column" marginTop={1}>
            <Text color={statusColor(section)}>{sectionLabel(section)}</Text>
            {rows.map(row => (
              <Box key={row.identity} width="100%">
                <Text color={statusColor(section)}>{statusIcon(section, frame)} </Text>
                <Text bold={row.title === 'current session'}>
                  {truncate(row.title, titleWidth).padEnd(titleWidth)}{' '}
                </Text>
                <Text dimColor>{truncate(row.detail, detailWidth)}</Text>
                <Box flexGrow={1} />
                <Text dimColor>{formatAge(row.timestamp, now)}</Text>
              </Box>
            ))}
          </Box>
        );
      })}
      {records.length > model.rows.length && <Text dimColor> … {records.length - model.rows.length} more</Text>}
      <Text dimColor> /sessions manage all</Text>
    </Box>
  );
});
