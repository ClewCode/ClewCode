/**
 * PeerDashboard — Live interactive dashboard for LAN peers and their tasks.
 *
 * Reads the same model as the text dashboard (`collectPeerDashboard`), so the
 * AI-facing peer_manage({ action: "list" }) and this view can never report different numbers.
 * Refreshes on a timer; select a peer to inspect its tasks and their results.
 */

import * as React from 'react';
import { Byline } from '../../components/design-system/Byline.js';
import { KeyboardShortcutHint } from '../../components/design-system/KeyboardShortcutHint.js';
import { Pane } from '../../components/design-system/Pane.js';
import { Box, Text, useInput } from '../../ink.js';
import { getGlobalDiscovery } from '../../peer/PeerDiscovery.js';
import { getGlobalPeerServer } from '../../peer/PeerServer.js';
import { collectPeerDashboard, type PeerDashboardData, type PeerDashboardTask } from '../../peer/peerDashboard.js';
import type { SwarmHealth } from '../../peer/peerHealth.js';

const REFRESH_INTERVAL_MS = 2000;
const RESULT_PREVIEW_LENGTH = 160;
const MAX_VISIBLE_TASKS = 8;

function healthColor(health: SwarmHealth): string {
  return health === 'healthy' ? 'ansi:green' : health === 'lagging' ? 'ansi:yellow' : 'ansi:red';
}

function taskColor(status: PeerDashboardTask['status']): string | undefined {
  if (status === 'done') return 'ansi:green';
  if (status === 'rejected') return 'ansi:red';
  return 'ansi:yellow';
}

function taskIcon(status: PeerDashboardTask['status']): string {
  return status === 'done' ? '☑' : status === 'rejected' ? '☒' : '☐';
}

function formatAge(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h`;
}

function TaskRow({ task, now }: { task: PeerDashboardTask; now: number }): React.ReactNode {
  const preview =
    task.result && task.result.length > RESULT_PREVIEW_LENGTH
      ? `${task.result.slice(0, RESULT_PREVIEW_LENGTH)}...`
      : task.result;
  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        <Text color={taskColor(task.status)}>{taskIcon(task.status)} </Text>
        <Text dimColor>{task.id.slice(0, 8)} </Text>
        <Text>{task.message}</Text>
        <Text dimColor> ({formatAge(Math.max(0, now - task.createdAt))} ago)</Text>
      </Box>
      {preview && (
        <Box paddingLeft={4}>
          <Text dimColor>↳ {preview}</Text>
        </Box>
      )}
    </Box>
  );
}

function PeerDashboard({ onDone }: { onDone: (result?: string, options?: any) => void }): React.ReactNode {
  const [data, setData] = React.useState<PeerDashboardData>(() => collectPeerDashboard());
  const [focus, setFocus] = React.useState(0);
  const [pendingOnly, setPendingOnly] = React.useState(false);

  React.useEffect(() => {
    const refresh = () => setData(collectPeerDashboard());
    const timer = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  // Rows are peers plus a trailing "unassigned" bucket when it is non-empty.
  const hasUnassigned = data.unassigned.length > 0;
  const rowCount = data.peers.length + (hasUnassigned ? 1 : 0);
  const clampedFocus = rowCount === 0 ? 0 : Math.min(focus, rowCount - 1);

  useInput((input, key) => {
    if (key.escape || input === 'q') {
      onDone(undefined, { display: 'skip' });
      return;
    }
    if (input === 'r') {
      setData(collectPeerDashboard());
      return;
    }
    if (input === 'p') {
      setPendingOnly(value => !value);
      return;
    }
    if (key.upArrow) setFocus(f => Math.max(0, f - 1));
    if (key.downArrow) setFocus(f => Math.min(rowCount - 1, f + 1));
  });

  const isSharing = (() => {
    try {
      return getGlobalDiscovery().isSharing;
    } catch {
      return false;
    }
  })();
  const selfPort = isSharing ? getGlobalPeerServer().port || '?' : null;

  const { totals } = data;
  const selectedUnassigned = hasUnassigned && clampedFocus === data.peers.length;
  const selectedPeer = selectedUnassigned ? undefined : data.peers[clampedFocus];
  const allTasks = selectedUnassigned ? data.unassigned : (selectedPeer?.tasks ?? []);
  const tasks = pendingOnly ? allTasks.filter(task => task.status === 'pending') : allTasks;
  const visibleTasks = tasks.slice(0, MAX_VISIBLE_TASKS);

  return (
    <Pane color="claude">
      <Box flexDirection="column">
        <Text color="remember" bold>
          Peer Dashboard
        </Text>
        <Text dimColor>
          {selfPort ? `sharing :${selfPort}` : 'not sharing'} | {totals.peers} peer(s) | {totals.healthy} healthy,{' '}
          {totals.lagging} lagging, {totals.offline} offline
          {totals.avgLatencyMs !== undefined ? ` | avg ${Math.round(totals.avgLatencyMs)}ms` : ''}
        </Text>
        <Text dimColor>
          {totals.tasks} task(s) | {totals.done} done, {totals.pending} pending
          {totals.rejected > 0 ? `, ${totals.rejected} rejected` : ''}
        </Text>
        {data.restored && <Text dimColor>↺ {data.restored}</Text>}

        {rowCount === 0 ? (
          <Box marginTop={1}>
            <Text dimColor italic>
              No peer activity. Run /peer share or /peer join &lt;host&gt;:&lt;port&gt; to get started.
            </Text>
          </Box>
        ) : (
          <Box marginTop={1} flexDirection="column">
            <Text dimColor>
              {'  '}
              {'NAME'.padEnd(18)}
              {'ROLE'.padEnd(12)}
              {'HEALTH'.padEnd(9)}
              {'LATENCY'.padEnd(9)}
              {'LOAD'.padEnd(9)}
              TASKS
            </Text>
            {data.peers.map((peer, i) => (
              <Box key={peer.id} flexDirection="row">
                <Text color={i === clampedFocus ? 'suggestion' : undefined}>{i === clampedFocus ? '> ' : '  '}</Text>
                <Text color={healthColor(peer.health)}>{peer.name.slice(0, 17).padEnd(18)}</Text>
                <Text dimColor>{(peer.role ?? '-').slice(0, 11).padEnd(12)}</Text>
                <Text color={healthColor(peer.health)}>{peer.health.padEnd(9)}</Text>
                <Text dimColor>{peer.latency.padEnd(9)}</Text>
                <Text dimColor>{peer.load.padEnd(9)}</Text>
                <Text dimColor>{peer.tasks.length}</Text>
              </Box>
            ))}
            {hasUnassigned && (
              <Box flexDirection="row">
                <Text color={selectedUnassigned ? 'suggestion' : undefined}>{selectedUnassigned ? '> ' : '  '}</Text>
                <Text dimColor>{'(unassigned)'.padEnd(18)}</Text>
                <Text dimColor>{'-'.padEnd(12)}</Text>
                <Text dimColor>{'-'.padEnd(9)}</Text>
                <Text dimColor>{'-'.padEnd(9)}</Text>
                <Text dimColor>{'-'.padEnd(9)}</Text>
                <Text dimColor>{data.unassigned.length}</Text>
              </Box>
            )}
          </Box>
        )}

        {rowCount > 0 && (
          <Box marginTop={1} flexDirection="column">
            <Text color="remember">
              {selectedUnassigned ? 'Tasks from disconnected peers' : `Tasks — ${selectedPeer?.name ?? ''}`}
              {pendingOnly ? ' (pending only)' : ''}
            </Text>
            {visibleTasks.length === 0 ? (
              <Text dimColor italic>
                {pendingOnly ? 'No pending tasks.' : 'No tasks.'}
              </Text>
            ) : (
              visibleTasks.map(task => <TaskRow key={task.id} task={task} now={data.generatedAt} />)
            )}
            {tasks.length > visibleTasks.length && <Text dimColor>… {tasks.length - visibleTasks.length} more</Text>}
          </Box>
        )}

        <Box marginTop={1}>
          <Byline>
            <KeyboardShortcutHint shortcut="arrows" action="select peer" />
            <KeyboardShortcutHint shortcut="p" action="pending only" />
            <KeyboardShortcutHint shortcut="r" action="refresh" />
            <KeyboardShortcutHint shortcut="Esc" action="close" />
          </Byline>
        </Box>
      </Box>
    </Pane>
  );
}

export default PeerDashboard;
