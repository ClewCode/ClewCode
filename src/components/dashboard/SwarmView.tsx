/**
 * SwarmView — Interactive dashboard for peer swarm dispatches and dynamic workflow runs.
 * Shows live progress, tokens, and supports kill/retry operations.
 */

import figures from 'figures';
import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  cancelDynamicRun,
  type DynamicRunState,
  listAllDynamicRuns,
  loadDynamicRun,
} from '../../agentRuntime/dynamicWorkflowPersistence.js';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
import { Box, Text, useInput } from '../../ink.js';
import { getSwarmActivityRegistry, type SwarmRunEntry } from '../../peer/swarmActivity.js';
import { Divider } from '../design-system/Divider.js';
import { ProgressBar } from '../design-system/ProgressBar.js';
import { StatusIcon } from '../design-system/StatusIcon.js';

type ViewTab = 'swarm' | 'workflows';
type SelectionType = 'peer' | 'workflow';

interface Selection {
  type: SelectionType;
  index: number;
  runId?: string;
  hostname?: string;
}

function formatAge(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}

function statusColor(status: string): 'success' | 'warning' | 'error' {
  switch (status) {
    case 'running':
    case 'done':
      return 'success';
    case 'pending':
      return 'warning';
    case 'failed':
    case 'timedout':
    case 'aborted':
      return 'error';
    default:
      return 'warning';
  }
}

interface SwarmViewProps {
  workspaceRoot: string;
}

export function SwarmView({ workspaceRoot }: SwarmViewProps): React.ReactElement {
  const [tab, setTab] = useState<ViewTab>('swarm');
  const [swarmRuns, setSwarmRuns] = useState<SwarmRunEntry[]>([]);
  const [workflowRuns, setWorkflowRuns] = useState<DynamicRunState[]>([]);
  const [selection, setSelection] = useState<Selection>({ type: 'peer', index: 0 });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const { width: termWidth = 80 } = useTerminalSize();

  // Polling: refresh swarm and workflow data
  useEffect(() => {
    const registry = getSwarmActivityRegistry();
    const unsubscribe = registry.subscribe(() => {
      const active = registry.getActiveRuns();
      const recent = registry.getRecentRuns(5);
      setSwarmRuns([...active, ...recent]);
    });

    const interval = setInterval(async () => {
      try {
        const runs = await listAllDynamicRuns(workspaceRoot);
        setWorkflowRuns(runs);
      } catch (err) {
        // Silent fail on workflow load
      }
    }, 1000);

    // Initial load
    setSwarmRuns([...registry.getActiveRuns(), ...registry.getRecentRuns(5)]);
    listAllDynamicRuns(workspaceRoot).then(setWorkflowRuns).catch(() => {});

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [workspaceRoot]);

  // Keyboard input handling
  useInput((input, key) => {
    if (key.leftArrow || input === 'h') {
      setTab(tab === 'swarm' ? 'workflows' : 'swarm');
    } else if (key.rightArrow || input === 'l') {
      setTab(tab === 'swarm' ? 'workflows' : 'swarm');
    } else if (key.upArrow) {
      setSelection(s => ({ ...s, index: Math.max(0, s.index - 1) }));
    } else if (key.downArrow) {
      const maxIndex = tab === 'swarm' ? swarmRuns.length : workflowRuns.length;
      setSelection(s => ({ ...s, index: Math.min(maxIndex - 1, s.index + 1) }));
    } else if (input === 'k') {
      handleKill();
    } else if (input === 'r') {
      handleRetry();
    }
  });

  const handleKill = useCallback(async () => {
    if (busy || selection.index < 0) return;
    setBusy(true);
    setMessage('');

    try {
      if (tab === 'swarm' && swarmRuns[selection.index]) {
        const run = swarmRuns[selection.index];
        const registry = getSwarmActivityRegistry();
        if (selection.hostname && run.peers.has(selection.hostname)) {
          registry.abortPeer(run.runId, selection.hostname);
          setMessage(`Aborted ${selection.hostname}`);
        } else {
          setMessage('Cannot abort: peer not found');
        }
      } else if (tab === 'workflows' && workflowRuns[selection.index]) {
        const run = workflowRuns[selection.index];
        if (run.status === 'running' || run.status === 'paused') {
          await cancelDynamicRun(workspaceRoot, run.runId);
          setMessage(`Cancelled workflow ${run.runId.slice(0, 8)}`);
        } else {
          setMessage('Cannot cancel: run not running');
        }
      }
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setBusy(false);
      setTimeout(() => setMessage(''), 2000);
    }
  }, [busy, tab, selection, swarmRuns, workflowRuns, workspaceRoot]);

  const handleRetry = useCallback(async () => {
    if (busy) return;
    setMessage('Retry not yet implemented');
    setTimeout(() => setMessage(''), 2000);
  }, [busy]);

  // Render swarm tab
  const swarmContent = useMemo(() => {
    if (swarmRuns.length === 0) {
      return <Text dimColor>No active or recent swarm runs</Text>;
    }

    return (
      <Box flexDirection="column" gap={0} marginTop={0} marginBottom={1}>
        {swarmRuns.map((run, idx) => (
          <Box key={run.runId} flexDirection="column" gap={0} marginTop={0} marginBottom={0}>
            <Box>
              <Text bold>{run.command.slice(0, 50)}</Text>
              <Text dimColor> ({run.peers.size} peers, {formatAge(Date.now() - run.startedAt)})</Text>
            </Box>
            {Array.from(run.peers.entries()).map(([hostname, state]) => {
              const isSelected = selection.type === 'peer' && selection.index === idx && selection.hostname === hostname;
              const bg = isSelected ? 'blue' : undefined;
              return (
                <Box key={hostname} paddingLeft={2} marginBottom={0}>
                  <StatusIcon status={statusColor(state.status)} />
                  <Text color={bg}> {hostname}</Text>
                  <Text dimColor> {state.status}</Text>
                  {state.durationMs && <Text dimColor> {formatAge(state.durationMs)}</Text>}
                </Box>
              );
            })}
            <Divider />
          </Box>
        ))}
      </Box>
    );
  }, [swarmRuns, selection]);

  // Render workflows tab
  const workflowContent = useMemo(() => {
    if (workflowRuns.length === 0) {
      return <Text dimColor>No dynamic workflows found</Text>;
    }

    return (
      <Box flexDirection="column" gap={0} marginTop={0} marginBottom={1}>
        {workflowRuns.map((run, idx) => {
          const isSelected = selection.type === 'workflow' && selection.index === idx;
          const bg = isSelected ? 'blue' : undefined;
          const done = run.completedSubtaskIds?.length ?? 0;
          const total = run.completedSubtaskIds ? run.completedSubtaskIds.length + (run.runningSubtaskIds?.length ?? 0) : 0;
          const progress = total > 0 ? done / total : 0;

          return (
            <Box key={run.runId} flexDirection="column" gap={0} marginTop={0} marginBottom={1}>
              <Box>
                <StatusIcon status={statusColor(run.status)} />
                <Text color={bg} bold>
                  {' '}
                  {run.workflowId.slice(0, 20)}...
                </Text>
                <Text dimColor> ({run.status})</Text>
              </Box>
              <Box paddingLeft={2} marginBottom={0}>
                <ProgressBar ratio={progress} width={Math.max(20, termWidth - 30)} />
                <Text dimColor> {done}/{total}</Text>
              </Box>
              {run.status === 'running' && <Text dimColor paddingLeft={2}>(Press k to cancel, r to retry)</Text>}
              <Divider />
            </Box>
          );
        })}
      </Box>
    );
  }, [workflowRuns, selection, termWidth]);

  return (
    <Box flexDirection="column" gap={0} marginTop={0} marginBottom={1}>
      <Box marginBottom={1}>
        <Text bold color={tab === 'swarm' ? 'cyan' : 'white'}>
          {tab === 'swarm' ? figures.pointerSmall : ' '} Swarm
        </Text>
        <Text> </Text>
        <Text bold color={tab === 'workflows' ? 'cyan' : 'white'}>
          {tab === 'workflows' ? figures.pointerSmall : ' '} Workflows
        </Text>
        <Text dimColor> (← → to switch, ↑ ↓ to select, k to kill, r to retry)</Text>
      </Box>

      {tab === 'swarm' && swarmContent}
      {tab === 'workflows' && workflowContent}

      {message && (
        <Box marginTop={1}>
          <Text dimColor>{message}</Text>
        </Box>
      )}
    </Box>
  );
}
