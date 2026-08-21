/**
 * SwarmView — Interactive dashboard for dynamic workflow runs.
 * Shows live progress, tokens, and supports cancel operations.
 *
 * The peer-swarm tab was removed when the LAN peer system was deleted; this
 * view now focuses on the agentRuntime dynamic-workflow runs.
 */

import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import {
  cancelDynamicRun,
  type DynamicRunState,
  listAllDynamicRuns,
} from '../../agentRuntime/dynamicWorkflowPersistence.js';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
import { Box, Text, useInput } from '../../ink.js';
import { Divider } from '../design-system/Divider.js';
import { ProgressBar } from '../design-system/ProgressBar.js';
import { StatusIcon } from '../design-system/StatusIcon.js';

interface SwarmViewProps {
  workspaceRoot: string;
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

export function SwarmView({ workspaceRoot }: SwarmViewProps): React.ReactElement {
  const [workflowRuns, setWorkflowRuns] = useState<DynamicRunState[]>([]);
  const [selection, setSelection] = useState({ index: 0 });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const { columns: termWidth = 80 } = useTerminalSize();

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const runs = await listAllDynamicRuns(workspaceRoot);
        setWorkflowRuns(runs);
      } catch {
        // Silent fail on workflow load
      }
    }, 1000);

    listAllDynamicRuns(workspaceRoot)
      .then(setWorkflowRuns)
      .catch(() => {
        /* noop */
      });

    return () => clearInterval(interval);
  }, [workspaceRoot]);

  useInput((input, key) => {
    if (key.upArrow) {
      setSelection(s => ({ ...s, index: Math.max(0, s.index - 1) }));
    } else if (key.downArrow) {
      setSelection(s => ({ ...s, index: Math.min(workflowRuns.length - 1, s.index + 1) }));
    } else if (input === 'k') {
      handleKill();
    }
  });

  const handleKill = useCallback(async () => {
    if (busy || selection.index < 0) return;
    setBusy(true);
    setMessage('');
    try {
      const run = workflowRuns[selection.index];
      if (run && (run.status === 'running' || run.status === 'paused')) {
        await cancelDynamicRun(workspaceRoot, run.runId);
        setMessage(`Cancelled workflow ${run.runId.slice(0, 8)}`);
      } else {
        setMessage('Cannot cancel: run not running');
      }
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setBusy(false);
      setTimeout(() => setMessage(''), 2000);
    }
  }, [busy, selection, workflowRuns, workspaceRoot]);

  const workflowContent = (
    <Box flexDirection="column" gap={0} marginTop={0} marginBottom={1}>
      {workflowRuns.length === 0 ? (
        <Text dimColor>No dynamic workflows found</Text>
      ) : (
        workflowRuns.map((run, idx) => {
          const isSelected = selection.index === idx;
          const bg = isSelected ? 'blue' : undefined;
          const done = run.completedSubtaskIds?.length ?? 0;
          const total = run.completedSubtaskIds
            ? run.completedSubtaskIds.length + (run.runningSubtaskIds?.length ?? 0)
            : 0;
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
                <Text dimColor>
                  {' '}
                  {done}/{total}
                </Text>
              </Box>
              {run.status === 'running' && (
                <Text dimColor paddingLeft={2}>
                  (Press k to cancel)
                </Text>
              )}
              <Divider />
            </Box>
          );
        })
      )}
    </Box>
  );

  return (
    <Box flexDirection="column" gap={0} marginTop={0} marginBottom={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Workflows
        </Text>
        <Text dimColor> (↑ ↓ to select, k to cancel)</Text>
      </Box>
      {workflowContent}
      {message && (
        <Box marginTop={1}>
          <Text dimColor>{message}</Text>
        </Box>
      )}
    </Box>
  );
}
