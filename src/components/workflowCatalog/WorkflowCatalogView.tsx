/**
 * WorkflowCatalogView — Interactive TUI for inspecting and managing dynamic workflow runs.
 */

import React, { useEffect, useState } from 'react';
import type { DynamicWorkflow } from '../../agentRuntime/dynamicWorkflow.js';
import {
  cancelDynamicRun,
  type DynamicRunState,
  listAllDynamicRuns,
  loadDynamicRun,
} from '../../agentRuntime/dynamicWorkflowPersistence.js';
import { Box, Text, useInput } from '../../ink.js';
import { getCwd } from '../../utils/cwd.js';

export interface WorkflowCatalogViewProps {
  initialRunId?: string;
  onDone: (result?: string) => void;
  onResume?: (runId: string) => void;
}

export function WorkflowCatalogView({ initialRunId, onDone, onResume }: WorkflowCatalogViewProps): React.ReactNode {
  const [runs, setRuns] = useState<DynamicRunState[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedDetails, setSelectedDetails] = useState<{
    workflow: DynamicWorkflow;
    state: DynamicRunState;
  } | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [inspecting, setInspecting] = useState(false);

  const workspaceRoot = getWorkspaceRoot();

  const refreshRuns = async () => {
    try {
      const all = await listAllDynamicRuns(workspaceRoot);
      setRuns(all);
      if (initialRunId) {
        const found = all.findIndex(r => r.runId === initialRunId || r.workflowId === initialRunId);
        if (found !== -1) {
          setSelectedIndex(found);
          loadDetails(all[found]!.runId);
        }
      }
    } catch {
      setRuns([]);
    }
  };

  const loadDetails = async (runId: string) => {
    const loaded = await loadDynamicRun(workspaceRoot, runId);
    if (loaded) {
      setSelectedDetails(loaded);
    }
  };

  useEffect(() => {
    refreshRuns();
  }, []);

  useEffect(() => {
    if (runs[selectedIndex]) {
      loadDetails(runs[selectedIndex]!.runId);
    }
  }, [selectedIndex, runs]);

  useInput((input, key) => {
    if (key.escape || input === 'q') {
      onDone();
      return;
    }

    if (key.upArrow || input === 'k') {
      setSelectedIndex(prev => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow || input === 'j') {
      setSelectedIndex(prev => Math.min(runs.length - 1, prev + 1));
      return;
    }

    if (key.return || input === ' ') {
      setInspecting(prev => !prev);
      return;
    }

    const current = runs[selectedIndex];
    if (!current) return;

    if (input === 'r') {
      if (onResume) {
        onResume(current.runId);
      } else {
        onDone(`Workflow ${current.runId} marked ready to resume.`);
      }
      return;
    }

    if (input === 'c') {
      cancelDynamicRun(workspaceRoot, current.runId).then(cancelled => {
        if (cancelled) {
          setStatusMessage(`Cancelled workflow ${current.runId}`);
          refreshRuns();
        }
      });
      return;
    }
  });

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1} borderStyle="round" borderColor="cyan">
      {/* Header */}
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color="cyan">
          ◈ Dynamic Workflows Catalog
        </Text>
        <Text dimColor>{runs.length} workflow runs</Text>
      </Box>

      {/* Status Notice */}
      {statusMessage && (
        <Box marginBottom={1}>
          <Text color="yellow">ℹ {statusMessage}</Text>
        </Box>
      )}

      {/* Main Content */}
      {runs.length === 0 ? (
        <Box paddingY={2} justifyContent="center">
          <Text dimColor>No persisted dynamic workflow runs found in workspace.</Text>
        </Box>
      ) : inspecting && selectedDetails ? (
        /* Detailed Inspector View */
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold color="white">
              Workflow: {selectedDetails.workflow.id}
            </Text>
            <Text> • Status: </Text>
            <StatusBadge status={selectedDetails.state.status} />
          </Box>

          <Box marginBottom={1}>
            <Text dimColor>Prompt: </Text>
            <Text>{selectedDetails.workflow.originalPrompt}</Text>
          </Box>

          {selectedDetails.workflow.rationale && (
            <Box marginBottom={1}>
              <Text dimColor>Rationale: </Text>
              <Text italic>{selectedDetails.workflow.rationale}</Text>
            </Box>
          )}

          <Box marginBottom={1} gap={2}>
            <Text dimColor>Cost Tier: {selectedDetails.workflow.estimatedTokenCost}</Text>
            <Text dimColor>Max Parallel: {selectedDetails.workflow.maxParallel}</Text>
            <Text dimColor>
              Progress: {selectedDetails.state.completedSubtaskIds.length}/{selectedDetails.workflow.subtasks.length}{' '}
              subtasks
            </Text>
          </Box>

          <Box flexDirection="column" marginTop={1}>
            <Text bold underline>
              Subtasks DAG:
            </Text>
            {selectedDetails.workflow.subtasks.map(task => {
              const isDone = selectedDetails.state.completedSubtaskIds.includes(task.id);
              const isRunning = selectedDetails.state.runningSubtaskIds?.includes(task.id);
              const result = selectedDetails.state.results.find(r => r.subtaskId === task.id);
              const icon = isDone ? '✓' : isRunning ? '⚡' : '○';
              const iconColor = isDone ? 'green' : isRunning ? 'yellow' : 'gray';

              return (
                <Box key={task.id} marginLeft={1} flexDirection="column">
                  <Box gap={1}>
                    <Text color={iconColor}>{icon}</Text>
                    <Text bold color="white">
                      {task.title}
                    </Text>
                    <Text color="blue">[{task.role}]</Text>
                    {result?.verification && (
                      <Text color={result.verification === 'confirmed' ? 'green' : 'yellow'}>
                        ({result.verification})
                      </Text>
                    )}
                  </Box>
                  {task.dependsOn.length > 0 && (
                    <Box marginLeft={3}>
                      <Text dimColor>↳ Depends on: {task.dependsOn.join(', ')}</Text>
                    </Box>
                  )}
                </Box>
              );
            })}
          </Box>
        </Box>
      ) : (
        /* List View */
        <Box flexDirection="column">
          {runs.map((run, idx) => {
            const isSelected = idx === selectedIndex;
            const completedCount = run.completedSubtaskIds.length;
            const totalCount = run.results.length + run.completedSubtaskIds.length;
            const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

            return (
              <Box
                key={run.runId}
                backgroundColor={isSelected ? '#1e293b' : undefined}
                paddingX={1}
                justifyContent="space-between"
              >
                <Box gap={1}>
                  <Text color={isSelected ? 'cyan' : 'gray'}>{isSelected ? '▶' : ' '}</Text>
                  <Text bold={isSelected} color={isSelected ? 'white' : undefined}>
                    {run.workflowId || run.runId}
                  </Text>
                  <StatusBadge status={run.status} />
                </Box>

                <Box gap={2}>
                  <Text dimColor>{renderProgressBar(progressPct)}</Text>
                  <Text dimColor>{completedCount} done</Text>
                  <Text dimColor>{run.startedAt.slice(0, 16).replace('T', ' ')}</Text>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}

      {/* Footer Controls */}
      <Box
        marginTop={1}
        paddingTop={1}
        borderStyle="single"
        borderTop
        borderColor="gray"
        justifyContent="space-between"
      >
        <Text dimColor>
          {inspecting
            ? '[Enter/Space Back to List]  [r Resume]  [c Cancel]  [Esc Exit]'
            : '[↑/↓ Select]  [Enter Inspect]  [r Resume]  [c Cancel]  [Esc Exit]'}
        </Text>
      </Box>
    </Box>
  );
}

function StatusBadge({ status }: { status: string }): React.ReactNode {
  switch (status) {
    case 'completed':
      return <Text color="green">[completed]</Text>;
    case 'running':
      return <Text color="yellow">[running]</Text>;
    case 'paused':
      return <Text color="magenta">[paused]</Text>;
    case 'failed':
      return <Text color="red">[failed]</Text>;
    case 'cancelled':
      return <Text color="gray">[cancelled]</Text>;
    default:
      return <Text color="blue">[{status}]</Text>;
  }
}

function renderProgressBar(percentage: number): string {
  const totalBars = 10;
  const filled = Math.round((percentage / 100) * totalBars);
  const empty = totalBars - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${percentage}%`;
}

function getWorkspaceRoot(): string {
  try {
    return getCwd();
  } catch {
    return process.cwd();
  }
}
