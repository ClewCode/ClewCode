import type { UUID } from 'node:crypto';
import * as React from 'react';
import { Spinner } from '../../components/Spinner.js';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
import { Box, Text, useInput } from '../../ink.js';
import type { LocalJSXCommandCall } from '../../types/command.js';
import {
  EXTERNAL_TOOL_LABELS,
  type ExternalSessionMeta,
  type ExternalTool,
  getAvailableTools,
  importExternalSession,
  listAllExternalSessions,
} from '../../utils/externalSessions/index.js';
import { getLastSessionLog } from '../../utils/sessionStorage.js';

function timeAgo(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

const VALID_TOOLS: ExternalTool[] = ['claude', 'codex', 'opencode', 'gemini'];

function ImportPicker({
  toolFilter,
  onDone,
  onResume,
}: {
  toolFilter?: ExternalTool;
  onDone: (msg?: string, opts?: { display?: 'skip' | 'system' | 'user' }) => void;
  onResume: (sessionId: UUID) => Promise<void>;
}): React.ReactNode {
  const { rows } = useTerminalSize();
  const [sessions, setSessions] = React.useState<ExternalSessionMeta[] | null>(null);
  const [selected, setSelected] = React.useState(0);
  const [importing, setImporting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listAllExternalSessions({
          tools: toolFilter ? [toolFilter] : undefined,
        });
        if (!cancelled) setSessions(list);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toolFilter]);

  const maxVisible = Math.max(4, Math.min(rows - 6, 15));
  const windowStart = Math.max(0, Math.min(selected - Math.floor(maxVisible / 2), (sessions?.length ?? 0) - maxVisible));

  useInput((input, key) => {
    if (importing || !sessions || sessions.length === 0) {
      if (key.escape) onDone('Import cancelled', { display: 'system' });
      return;
    }
    if (key.escape) {
      onDone('Import cancelled', { display: 'system' });
      return;
    }
    if (key.upArrow) setSelected(p => Math.max(0, p - 1));
    else if (key.downArrow) setSelected(p => Math.min(sessions.length - 1, p + 1));
    else if (key.return) {
      const meta = sessions[selected];
      if (!meta) return;
      setImporting(true);
      (async () => {
        try {
          const { sessionId } = await importExternalSession(meta);
          await onResume(sessionId as UUID);
        } catch (e) {
          setError((e as Error).message);
          setImporting(false);
        }
      })();
    }
  });

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="error">Import failed: {error}</Text>
      </Box>
    );
  }

  if (!sessions) {
    return (
      <Box>
        <Spinner />
        <Text> Scanning sessions from other CLIs…</Text>
      </Box>
    );
  }

  if (importing) {
    return (
      <Box>
        <Spinner />
        <Text> Importing & resuming…</Text>
      </Box>
    );
  }

  if (sessions.length === 0) {
    const avail = getAvailableTools();
    return (
      <Box flexDirection="column">
        <Text>No sessions found from other CLIs.</Text>
        <Text dimColor>
          {avail.length ? `Detected: ${avail.map(t => EXTERNAL_TOOL_LABELS[t]).join(', ')}` : 'No supported CLIs detected.'}
        </Text>
      </Box>
    );
  }

  const visible = sessions.slice(windowStart, windowStart + maxVisible);
  return (
    <Box flexDirection="column">
      <Text bold>Resume from another CLI · {sessions.length} sessions</Text>
      <Text dimColor>↑↓ select · enter to import &amp; resume · esc to cancel</Text>
      <Box flexDirection="column" marginTop={1}>
        {visible.map(s => {
          const idx = sessions.indexOf(s);
          const isSel = idx === selected;
          return (
            <Box key={`${s.tool}-${s.externalId}`} flexDirection="row">
              <Text color={isSel ? 'suggestion' : undefined}>{isSel ? '❯ ' : '  '}</Text>
              <Text color={isSel ? 'suggestion' : 'blue'}>{EXTERNAL_TOOL_LABELS[s.tool].padEnd(12)}</Text>
              <Text bold={isSel} wrap="truncate">
                {' '}
                {s.title}
              </Text>
              <Text dimColor>
                {'  '}
                {s.messageCount}msg · {timeAgo(s.modified)}
              </Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

export const call: LocalJSXCommandCall = async (onDone, context, args) => {
  const arg = args?.trim().toLowerCase();
  const toolFilter = VALID_TOOLS.find(t => t === arg);

  const onResume = async (sessionId: UUID) => {
    try {
      const log = await getLastSessionLog(sessionId, { includePreCompactHistory: true });
      if (!log) {
        onDone(`Imported session ${sessionId} but could not load it to resume. Try /resume.`, { display: 'system' });
        return;
      }
      await context.resume?.(sessionId, log, 'slash_command_session_id');
      onDone(undefined, { display: 'skip' });
    } catch (e) {
      onDone(`Failed to resume imported session: ${(e as Error).message}`, { display: 'system' });
    }
  };

  return <ImportPicker key={Date.now()} toolFilter={toolFilter} onDone={onDone} onResume={onResume} />;
};
