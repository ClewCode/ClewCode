import React, { useCallback, useEffect, useState } from 'react';
import { Orchestrator } from '../../agentRuntime/orchestrator.js';
import { RunStore } from '../../agentRuntime/runStore.js';
import type { AgentRun, AgentState } from '../../agentRuntime/types.js';
import { DashboardMonitor } from '../../components/dashboard/DashboardMonitor.js';
import { SwarmView } from '../../components/dashboard/SwarmView.js';
import { Dialog } from '../../components/design-system/Dialog.js';
import { Divider } from '../../components/design-system/Divider.js';
import { ProgressBar } from '../../components/design-system/ProgressBar.js';
import { StatusIcon } from '../../components/design-system/StatusIcon.js';
import { Tab, Tabs } from '../../components/design-system/Tabs.js';
import { Box, Text, useInput } from '../../ink.js';
import {
  getAutonomousStatus,
  startAutonomousAgent,
  stopAutonomousAgent,
} from '../../services/autonomous/supervisorIntegration.js';
import { listTasks, loadQueue, type TaskQueueEntry } from '../../services/autonomous/taskQueue.js';
import { useAppState } from '../../state/AppState.js';
import type { LocalJSXCommandOnDone } from '../../types/command.js';
import { getFullGoalState } from '../../utils/sessionGoalState.js';

interface DashboardProps {
  onDone: LocalJSXCommandOnDone;
}

/** Semantic color for a run status */
function runStatusColor(status: AgentRun['status']): 'success' | 'error' | 'warning' | 'info' | undefined {
  switch (status) {
    case 'running':
    case 'testing':
      return 'success';
    case 'planning':
    case 'reviewing':
      return 'warning';
    case 'waiting_approval':
      return 'error';
    case 'completed':
      return 'info';
    case 'failed':
    case 'cancelled':
      return 'error';
    default:
      return undefined;
  }
}

/** Semantic status for StatusIcon */
function runStatusIcon(status: AgentRun['status']): 'success' | 'error' | 'warning' | 'pending' | 'loading' {
  switch (status) {
    case 'running':
    case 'testing':
      return 'success';
    case 'planning':
    case 'reviewing':
      return 'warning';
    case 'waiting_approval':
      return 'warning';
    case 'completed':
      return 'success';
    case 'failed':
    case 'cancelled':
      return 'error';
    default:
      return 'pending';
  }
}

export function DashboardComponent({ onDone }: DashboardProps): React.ReactNode {
  const mcpClients = useAppState(s => s.mcp.clients);
  const mcpTools = useAppState(s => s.mcp.tools);

  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [runStates, setRunStates] = useState<Record<string, AgentState>>({});
  const [tasks, setTasks] = useState<TaskQueueEntry[]>([]);
  const [daemonStatus, setDaemonStatus] = useState<any>(null);
  const [selectedTab, setSelectedTab] = useState('overview');

  // Goals
  const sessionGoal = useAppState(s => s.sessionGoal);
  const sessionGoalTurnCount = useAppState(s => s.sessionGoalTurnCount) ?? 0;
  const goalState = getFullGoalState();

  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Agent run list selection
  const [selectedRunIdx, setSelectedRunIdx] = useState(0);
  // Task list selection
  const [selectedTaskIdx, setSelectedTaskIdx] = useState(0);

  const refreshData = useCallback(async () => {
    try {
      const workspaceRoot = process.cwd();
      const runStore = new RunStore(workspaceRoot);
      const fetchedRuns = await runStore.listRuns();
      setRuns(fetchedRuns);

      const states: Record<string, AgentState> = {};
      for (const run of fetchedRuns.slice(0, 10)) {
        try {
          const stateObj = await runStore.loadState(run.id);
          states[run.id] = stateObj;
        } catch {
          // ignore
        }
      }
      setRunStates(states);

      await loadQueue();
      const fetchedTasks = listTasks();
      setTasks(fetchedTasks);

      const ds = await getAutonomousStatus();
      setDaemonStatus(ds);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void refreshData();
    const timer = setInterval(() => {
      void refreshData();
    }, 1000);
    return () => clearInterval(timer);
  }, [refreshData]);

  // Clamp indices when lists change
  useEffect(() => {
    if (selectedRunIdx >= runs.length) setSelectedRunIdx(Math.max(0, runs.length - 1));
  }, [runs.length, selectedRunIdx]);
  useEffect(() => {
    if (selectedTaskIdx >= tasks.length) setSelectedTaskIdx(Math.max(0, tasks.length - 1));
  }, [tasks.length, selectedTaskIdx]);

  // Active runs counter
  const activeRuns = runs.filter(r => r.status !== 'completed' && r.status !== 'failed' && r.status !== 'cancelled');

  // --- Overview tab content ---
  const renderOverview = () => {
    const daemonAgent = daemonStatus?.agent;
    const daemonUptime = daemonAgent?.running ? Math.round((Date.now() - daemonAgent.startedAt) / 1000) : 0;

    return (
      <Box flexDirection="column" gap={1}>
        {/* Session Goal */}
        <Box flexDirection="column" gap={0}>
          <Text bold>
            <StatusIcon status={sessionGoal ? 'loading' : 'pending'} withSpace />
            Session Goal
          </Text>
          {sessionGoal ? (
            <Box flexDirection="column" marginLeft={3} gap={0}>
              <Text>{sessionGoal}</Text>
              <Box flexDirection="row" gap={1} alignItems="center" marginTop={0}>
                <Text dimColor>
                  Turns: {sessionGoalTurnCount}
                  {goalState?.maxTurns ? ` / ${goalState.maxTurns}` : ''}
                </Text>
                {goalState?.maxTurns && (
                  <Box flexDirection="row" gap={0}>
                    <Text dimColor>[</Text>
                    <ProgressBar ratio={sessionGoalTurnCount / goalState.maxTurns} width={20} fillColor="warning" />
                    <Text dimColor>] {Math.round((sessionGoalTurnCount / goalState.maxTurns) * 100)}%</Text>
                  </Box>
                )}
              </Box>
            </Box>
          ) : (
            <Text dimColor marginLeft={3}>
              No active goal. Set one via /goal.
            </Text>
          )}
        </Box>

        <Divider />

        {/* Daemon Status */}
        <Box flexDirection="column" gap={0}>
          <Text bold>
            <StatusIcon
              status={daemonStatus?.running ? 'success' : daemonStatus?.enabled ? 'warning' : 'pending'}
              withSpace
            />
            Daemon
          </Text>
          {daemonStatus ? (
            <Box flexDirection="column" marginLeft={3} gap={0}>
              <Text>
                <Text color={daemonStatus.running ? 'success' : daemonStatus.enabled ? 'warning' : undefined}>
                  {daemonStatus.running ? 'Running' : daemonStatus.enabled ? 'Enabled' : 'Disabled'}
                </Text>
                <Text dimColor> · auto-start {daemonStatus.autoStart ? 'on' : 'off'}</Text>
              </Text>
              {daemonAgent?.running && (
                <Text dimColor>
                  PID {daemonAgent.workerPid ?? 'N/A'} · uptime {daemonUptime}s · processed {daemonAgent.tasksProcessed}{' '}
                  · failed {daemonAgent.tasksFailed}
                </Text>
              )}
              {daemonAgent?.currentTaskTitle && <Text color="suggestion">Current: {daemonAgent.currentTaskTitle}</Text>}
              {daemonAgent?.lastErrorMessage && <Text color="error">Error: {daemonAgent.lastErrorMessage}</Text>}
            </Box>
          ) : (
            <Text dimColor marginLeft={3}>
              Loading daemon status...
            </Text>
          )}
        </Box>

        <Divider />

        {/* Quick summary row */}
        <Box flexDirection="row" gap={4}>
          <Box flexDirection="row" gap={1}>
            <StatusIcon status={activeRuns.length > 0 ? 'success' : 'pending'} withSpace />
            <Text>
              <Text bold>{activeRuns.length}</Text>
              <Text dimColor> active agents</Text>
            </Text>
          </Box>
          <Box flexDirection="row" gap={1}>
            <StatusIcon
              status={tasks.filter(t => t.status === 'in_progress').length > 0 ? 'loading' : 'pending'}
              withSpace
            />
            <Text>
              <Text bold>{tasks.length}</Text>
              <Text dimColor> queued tasks</Text>
            </Text>
          </Box>
          <Box flexDirection="row" gap={1}>
            <StatusIcon status={mcpClients.length > 0 ? 'success' : 'pending'} withSpace />
            <Text>
              <Text bold>{mcpClients.length}</Text>
              <Text dimColor> MCP servers</Text>
            </Text>
          </Box>
        </Box>
      </Box>
    );
  };

  // --- Agents tab content ---
  const renderAgents = () => {
    if (runs.length === 0) {
      return <Text dimColor>No subagent runs found.</Text>;
    }

    return (
      <Box flexDirection="column" gap={0}>
        {runs.slice(0, 10).map((run, idx) => {
          const isSelected = idx === selectedRunIdx;
          const stateObj = runStates[run.id];
          const status = runStatusIcon(run.status);
          const color = runStatusColor(run.status);

          return (
            <Box key={run.id} flexDirection="column" marginTop={idx > 0 ? 0 : 0}>
              <Box flexDirection="row" gap={0}>
                <Text color={isSelected ? 'suggestion' : undefined}>{isSelected ? '> ' : '  '}</Text>
                <StatusIcon status={status} withSpace />
                <Text bold={isSelected} color={isSelected ? 'suggestion' : undefined}>
                  {run.activeAgent || 'Coordinator'}
                </Text>
                <Text dimColor> ({run.id.slice(-8)})</Text>
                <Text bold color={color}>
                  {' '}
                  [{run.status.toUpperCase()}]
                </Text>
              </Box>
              {stateObj && (
                <Box flexDirection="column" marginLeft={5}>
                  <Text dimColor>
                    Step: {stateObj.step}/{run.budget.maxSteps}
                  </Text>
                  {stateObj.taskSummary && (
                    <Text dimColor numberOfLines={1}>
                      ↳ {stateObj.taskSummary}
                    </Text>
                  )}
                </Box>
              )}
            </Box>
          );
        })}
        <Text dimColor marginTop={1}>
          ↑↓ navigate · k kill selected · {runs.length} total
        </Text>
      </Box>
    );
  };

  // --- Daemons tab content ---
  const renderDaemons = () => {
    const daemonAgent = daemonStatus?.agent;
    const daemonUptime = daemonAgent?.running ? Math.round((Date.now() - daemonAgent.startedAt) / 1000) : 0;

    return (
      <Box flexDirection="column" gap={1}>
        {/* Daemon status */}
        <Box flexDirection="column" gap={0}>
          <Text bold color="suggestion">
            <StatusIcon
              status={daemonStatus?.running ? 'success' : daemonStatus?.enabled ? 'warning' : 'pending'}
              withSpace
            />
            Autonomous Daemon
          </Text>
          {daemonStatus ? (
            <Box flexDirection="column" marginLeft={3} gap={0}>
              <Text>
                Status:{' '}
                <Text color={daemonStatus.running ? 'success' : daemonStatus.enabled ? 'warning' : 'error'}>
                  {daemonStatus.running ? 'Running' : daemonStatus.enabled ? 'Enabled' : 'Disabled'}
                </Text>
                <Text dimColor> · auto-start {daemonStatus.autoStart ? 'on' : 'off'}</Text>
              </Text>
              {daemonAgent && (
                <>
                  <Text dimColor>
                    PID: {daemonAgent.workerPid ?? 'N/A'} · uptime: {daemonUptime}s
                  </Text>
                  <Text dimColor>
                    Processed: {daemonAgent.tasksProcessed} · Failed: {daemonAgent.tasksFailed} · Dead-letter:{' '}
                    {daemonAgent.tasksDeadLettered ?? 0}
                  </Text>
                </>
              )}
              {daemonAgent?.currentTaskTitle && (
                <Text color="suggestion">Current task: {daemonAgent.currentTaskTitle}</Text>
              )}
              {daemonAgent?.lastErrorMessage && <Text color="error">Last error: {daemonAgent.lastErrorMessage}</Text>}
            </Box>
          ) : (
            <Text dimColor marginLeft={3}>
              Loading daemon status...
            </Text>
          )}
        </Box>

        <Divider />

        {/* MCP Servers */}
        <Box flexDirection="column" gap={0}>
          <Text bold color="suggestion">
            <StatusIcon status={mcpClients.length > 0 ? 'success' : 'pending'} withSpace />
            MCP Servers ({mcpClients.length})
          </Text>
          {mcpClients.length === 0 ? (
            <Text dimColor marginLeft={3}>
              No active MCP servers.
            </Text>
          ) : (
            mcpClients.map(client => {
              const activeTools = mcpTools.filter(t => t.mcpInfo?.serverName === client.name).length;
              return (
                <Box key={client.name} flexDirection="column" marginLeft={3} gap={0}>
                  <Box flexDirection="row" gap={1}>
                    <StatusIcon status={client.status === 'connected' ? 'success' : 'error'} />
                    <Text>{client.name}</Text>
                    <Text dimColor>({client.status})</Text>
                  </Box>
                  <Text dimColor marginLeft={3}>
                    Tools: {activeTools} active
                  </Text>
                </Box>
              );
            })
          )}
        </Box>

        <Divider />

        <Text dimColor>r restart daemon · s start/stop · {daemonStatus?.running ? 'Running' : 'Stopped'}</Text>
      </Box>
    );
  };

  // --- Tasks tab content ---
  const renderTasks = () => {
    // Counts
    const inProgress = tasks.filter(t => t.status === 'in_progress').length;
    const pending = tasks.filter(t => t.status === 'pending').length;
    const completed = tasks.filter(t => t.status === 'completed').length;
    const failed = tasks.filter(t => t.status === 'failed' || t.status === 'dead_letter').length;

    return (
      <Box flexDirection="column" gap={1}>
        {/* Summary row */}
        <Box flexDirection="row" gap={3}>
          <Text>
            <Text color="suggestion">{inProgress}</Text>
            <Text dimColor> running</Text>
          </Text>
          <Text>
            <Text color="warning">{pending}</Text>
            <Text dimColor> pending</Text>
          </Text>
          <Text>
            <Text color="success">{completed}</Text>
            <Text dimColor> done</Text>
          </Text>
          <Text>
            <Text color="error">{failed}</Text>
            <Text dimColor> failed</Text>
          </Text>
        </Box>

        <Divider />

        {tasks.length === 0 ? (
          <Text dimColor>No scheduled tasks in the queue.</Text>
        ) : (
          <Box flexDirection="column" gap={0}>
            {tasks.slice(0, 15).map((task, idx) => {
              const isSelected = idx === selectedTaskIdx;
              const statusColor =
                task.status === 'completed'
                  ? 'success'
                  : task.status === 'in_progress'
                    ? 'suggestion'
                    : task.status === 'failed' || task.status === 'dead_letter'
                      ? 'error'
                      : 'warning';
              const status =
                task.status === 'completed'
                  ? 'success'
                  : task.status === 'in_progress'
                    ? 'loading'
                    : task.status === 'failed' || task.status === 'dead_letter'
                      ? 'error'
                      : 'pending';

              const meta =
                task.status === 'completed'
                  ? `done`
                  : task.status === 'in_progress'
                    ? 'in progress'
                    : task.status === 'failed'
                      ? 'failed'
                      : 'pending';

              return (
                <Box key={task.id} flexDirection="column">
                  <Box flexDirection="row" gap={0}>
                    <Text color={isSelected ? 'suggestion' : undefined}>{isSelected ? '> ' : '  '}</Text>
                    <StatusIcon status={status} withSpace />
                    <Text bold={isSelected} color={isSelected ? 'suggestion' : undefined}>
                      {task.title}
                    </Text>
                    <Text dimColor> · {meta}</Text>
                    <Text color={statusColor} dimColor={task.status === 'pending'}>
                      {' '}
                      [{task.status.toUpperCase()}]
                    </Text>
                  </Box>
                  {(task.status === 'failed' || task.status === 'dead_letter') && (task.lastError || task.error) && (
                    <Text color="error" marginLeft={5}>
                      {task.lastError ?? task.error ?? ''}
                    </Text>
                  )}
                </Box>
              );
            })}
            <Text dimColor marginTop={1}>
              ↑↓ navigate · {tasks.length} total task{tasks.length !== 1 ? 's' : ''}
            </Text>
          </Box>
        )}

        {/* Session Goal section */}
        <Divider />
        {sessionGoal ? (
          <Box flexDirection="column" gap={0}>
            <Text bold>
              <StatusIcon status="loading" withSpace />
              Active Goal
            </Text>
            <Text marginLeft={3}>{sessionGoal}</Text>
            <Box flexDirection="row" gap={1} marginLeft={3}>
              <Text dimColor>
                Took {sessionGoalTurnCount} turn{goalState?.maxTurns ? ` of ${goalState.maxTurns}` : ''} so far
              </Text>
            </Box>
          </Box>
        ) : (
          <Text dimColor>No active session goal. Set one via /goal.</Text>
        )}
      </Box>
    );
  };

  // --- Keyboard handling ---
  useInput(
    async (input, key) => {
      if (busy) return;

      // Esc/q — already handled by Dialog

      if (selectedTab === 'agents') {
        if (key.upArrow) {
          setSelectedRunIdx(i => Math.max(0, Math.min(runs.length - 1, (i || 0) - 1)));
          return;
        }
        if (key.downArrow) {
          setSelectedRunIdx(i => Math.max(0, Math.min(runs.length - 1, (i || 0) + 1)));
          return;
        }
        // k — kill selected run
        if (input === 'k' && runs.length > 0) {
          const selectedRun = runs[selectedRunIdx];
          if (
            selectedRun &&
            selectedRun.status !== 'completed' &&
            selectedRun.status !== 'failed' &&
            selectedRun.status !== 'cancelled'
          ) {
            setBusy(true);
            setStatusMsg(`Cancelling agent run ${selectedRun.id}...`);
            try {
              const orchestrator = new Orchestrator(process.cwd());
              await orchestrator.cancelRun(selectedRun.id);
              setStatusMsg(`Cancelled run ${selectedRun.id}.`);
            } catch (err: any) {
              setStatusMsg(`Failed: ${err.message}`);
            } finally {
              setBusy(false);
              void refreshData();
            }
          }
          return;
        }
      }

      if (selectedTab === 'daemons') {
        // r — restart
        if (input === 'r') {
          setBusy(true);
          setStatusMsg('Restarting autonomous agent...');
          try {
            await stopAutonomousAgent();
            await new Promise(r => setTimeout(r, 1000));
            await startAutonomousAgent();
            setStatusMsg('Autonomous agent restarted.');
          } catch (err: any) {
            setStatusMsg(`Failed: ${err.message}`);
          } finally {
            setBusy(false);
            void refreshData();
          }
          return;
        }
        // s — start/stop toggle
        if (input === 's') {
          setBusy(true);
          if (daemonStatus?.running) {
            await stopAutonomousAgent();
            setStatusMsg('Autonomous agent stopped.');
          } else {
            await startAutonomousAgent();
            setStatusMsg('Autonomous agent started.');
          }
          await refreshData();
          setBusy(false);
          return;
        }
      }

      if (selectedTab === 'tasks') {
        if (key.upArrow) {
          setSelectedTaskIdx(i => Math.max(0, Math.min(tasks.length - 1, (i || 0) - 1)));
          return;
        }
        if (key.downArrow) {
          setSelectedTaskIdx(i => Math.max(0, Math.min(tasks.length - 1, (i || 0) + 1)));
          return;
        }
      }
    },
    { isActive: true },
  );

  return (
    <Dialog
      title="System Dashboard"
      subtitle="Overview of your workspace, agents, daemons, and tasks"
      onCancel={() => onDone('Dashboard closed.', { display: 'system' })}
      hideInputGuide
    >
      <Tabs defaultTab="overview" selectedTab={selectedTab} onTabChange={setSelectedTab} useFullWidth navFromContent>
        <Tab title="Overview" id="overview">
          {renderOverview()}
        </Tab>
        <Tab title="Agents" id="agents">
          {renderAgents()}
        </Tab>
        <Tab title="Daemons" id="daemons">
          {renderDaemons()}
        </Tab>
        <Tab title="Tasks" id="tasks">
          {renderTasks()}
        </Tab>
        <Tab title="Swarm" id="swarm">
          <SwarmView workspaceRoot={process.cwd()} />
        </Tab>
        <Tab title="Monitor" id="monitor">
          <DashboardMonitor onDone={onDone} />
        </Tab>
      </Tabs>

      {/* Status bar */}
      {statusMsg && (
        <Box marginTop={1}>
          <Text color="info">{statusMsg}</Text>
        </Box>
      )}

      {/* Footer hints */}
      <Box marginTop={1} justifyContent="center">
        <Text dimColor>
          Esc close · Tab switch tabs · {selectedTab === 'agents' && '↑↓ select · k kill · '}
          {selectedTab === 'daemons' && 'r restart daemon · '}
          {selectedTab === 'tasks' && '↑↓ select · '}
          {selectedTab === 'swarm' && '← → select tab · ↑↓ select · k kill · r retry · '}
          Refresh every 1s
        </Text>
      </Box>
    </Dialog>
  );
}

export async function call(onDone: LocalJSXCommandOnDone, _context: any, _args: string): Promise<React.ReactNode> {
  return React.createElement(DashboardComponent, { onDone });
}
