import fs from 'node:fs/promises';
import path from 'node:path';
import React, { useState } from 'react';
import { Orchestrator } from '../../agentRuntime/orchestrator.js';
import { RunStore } from '../../agentRuntime/runStore.js';
import { type OptionWithDescription, Select } from '../../components/CustomSelect/select.js';
import { Dialog } from '../../components/design-system/Dialog.js';
import { Box, Text } from '../../ink.js';
import type { ToolUseContext } from '../../Tool.js';
import { spawnTeammate } from '../../tools/shared/spawnMultiAgent.js';
import type { LocalJSXCommandContext, LocalJSXCommandOnDone } from '../../types/command.js';

function parseArgs(args: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';

  for (let i = 0; i < args.length; i++) {
    const char = args[i]!;
    if ((char === '"' || char === "'") && (i === 0 || args[i - 1] !== '\\')) {
      if (inQuotes && char === quoteChar) {
        inQuotes = false;
      } else if (!inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else {
        current += char;
      }
    } else if (char === ' ' && !inQuotes) {
      if (current.trim().length > 0) {
        result.push(current.trim());
      }
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim().length > 0) {
    result.push(current.trim());
  }
  return result;
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  _context: ToolUseContext & LocalJSXCommandContext,
  args: string,
): Promise<React.ReactNode> {
  const tokens = parseArgs(args || '');
  const subcommand = tokens[0]?.toLowerCase();
  const workspaceRoot = process.cwd();

  if (!subcommand) {
    return React.createElement(AgentCommandMenu, { onDone, workspaceRoot });
  }

  // /agent run → spawn real subagent via AgentTool system
  if (subcommand === 'run') {
    const task = tokens.slice(1).join(' ');
    if (!task) {
      onDone('Error: Please specify a task. Example: /agent run "Find bugs in auth module"', { display: 'system' });
      return null;
    }

    try {
      // Ensure a team exists
      const appState = _context.getAppState();
      let teamName = appState.teamContext?.teamName;
      if (!teamName) {
        const { mkdir, writeFile } = await import('node:fs/promises');
        const { join } = await import('node:path');
        const { homedir } = await import('node:os');
        teamName = 'agent-cli';
        const teamDir = join(homedir(), '.claude', 'teams', teamName);
        await mkdir(teamDir, { recursive: true });
        const lid = `team-lead@${teamName}`;
        await writeFile(
          join(teamDir, 'config.json'),
          JSON.stringify(
            {
              name: teamName,
              createdAt: Date.now(),
              leadAgentId: lid,
              members: [
                {
                  agentId: lid,
                  name: 'team-lead',
                  joinedAt: Date.now(),
                  tmuxPaneId: '',
                  cwd: process.cwd(),
                  subscriptions: [],
                },
              ],
            },
            null,
            2,
          ),
        );
      }

      const name =
        task
          .slice(0, 30)
          .replace(/[^a-zA-Z0-9]/g, '-')
          .toLowerCase() || 'agent';
      const userModel = appState.mainLoopModelForSession || appState.mainLoopModel;
      const result = await spawnTeammate(
        {
          name,
          prompt: task,
          agent_type: 'general-purpose',
          description: task.slice(0, 100),
          team_name: teamName,
          model: userModel,
        },
        _context,
      );
      const { agent_id, model } = result.data;
      onDone(`Subagent spawned: ${agent_id}\nModel: ${model || 'default'}\nTask: ${task}`, { display: 'system' });
    } catch (err) {
      onDone(`Error spawning agent: ${(err as Error).message}`, { display: 'system' });
    }
    return null;
  }

  await executeAgentCommand(onDone, workspaceRoot, args);
  return null;
}

type AgentMenuAction =
  | 'status'
  | 'approvals'
  | 'doctor'
  | 'help'
  | 'run'
  | 'status-detail'
  | 'trace'
  | 'pause'
  | 'resume'
  | 'report'
  | 'approve'
  | 'deny';

function AgentCommandMenu({
  onDone,
  workspaceRoot,
}: {
  onDone: LocalJSXCommandOnDone;
  workspaceRoot: string;
}): React.ReactNode {
  const [isRunning, setIsRunning] = useState(false);
  const [runningLabel, setRunningLabel] = useState<string | null>(null);

  const execute = (commandArgs: string, label: string): void => {
    setIsRunning(true);
    setRunningLabel(label);
    void executeAgentCommand(onDone, workspaceRoot, commandArgs);
  };

  const options: OptionWithDescription<AgentMenuAction>[] = [
    {
      label: 'Start a new run',
      value: 'run',
      type: 'input',
      placeholder: 'Describe the task',
      description: 'Run an agent from a task prompt',
      onChange: task => execute(`run ${task}`, 'Starting agent run'),
    },
    {
      label: 'Status',
      value: 'status',
      description: 'Show all agent runs',
    },
    {
      label: 'Run status',
      value: 'status-detail',
      type: 'input',
      placeholder: 'Run ID',
      description: 'Show one run in detail',
      onChange: runId => execute(`status ${runId}`, 'Loading run status'),
    },
    {
      label: 'Trace',
      value: 'trace',
      type: 'input',
      placeholder: 'Run ID',
      description: 'Show timeline and events for a run',
      onChange: runId => execute(`trace ${runId}`, 'Loading run trace'),
    },
    {
      label: 'Pause',
      value: 'pause',
      type: 'input',
      placeholder: 'Run ID',
      description: 'Pause a running execution',
      onChange: runId => execute(`pause ${runId}`, 'Pausing run'),
    },
    {
      label: 'Resume',
      value: 'resume',
      type: 'input',
      placeholder: 'Run ID',
      description: 'Resume a paused or blocked run',
      onChange: runId => execute(`resume ${runId}`, 'Resuming run'),
    },
    {
      label: 'Approvals',
      value: 'approvals',
      description: 'View pending human approvals',
    },
    {
      label: 'Approve',
      value: 'approve',
      type: 'input',
      placeholder: 'run-id approval-id',
      description: 'Approve a blocked operation',
      onChange: value => execute(`approve ${value}`, 'Approving operation'),
    },
    {
      label: 'Deny',
      value: 'deny',
      type: 'input',
      placeholder: 'run-id approval-id',
      description: 'Deny a blocked operation',
      onChange: value => execute(`deny ${value}`, 'Denying operation'),
    },
    {
      label: 'Report',
      value: 'report',
      type: 'input',
      placeholder: 'Run ID',
      description: 'Display a run report',
      onChange: runId => execute(`report ${runId}`, 'Loading report'),
    },
    {
      label: 'Doctor',
      value: 'doctor',
      description: 'Verify runtime directories and registries',
    },
    {
      label: 'Help',
      value: 'help',
      description: 'Show command reference',
    },
  ];

  const handleChange = (action: AgentMenuAction): void => {
    switch (action) {
      case 'status':
      case 'approvals':
      case 'doctor':
      case 'help':
        execute(action === 'help' ? '' : action, action === 'help' ? 'Opening help' : `Running ${action}`);
        return;
      default:
        return;
    }
  };

  return React.createElement(
    Dialog,
    {
      title: 'Clew Code Agent',
      subtitle: 'Use arrows to choose; Enter on input rows lets you type the value here.',
      onCancel: () => onDone('Agent menu dismissed', { display: 'system' }),
      isCancelActive: !isRunning,
      hideInputGuide: isRunning,
    },
    React.createElement(
      Box,
      { flexDirection: 'column' },
      isRunning ? React.createElement(Text, { dimColor: true }, `${runningLabel ?? 'Running command'}...`) : null,
      React.createElement(Select<AgentMenuAction>, {
        isDisabled: isRunning,
        options,
        onChange: handleChange,
        onCancel: () => onDone('Agent menu dismissed', { display: 'system' }),
        visibleOptionCount: 8,
        layout: 'compact-vertical',
      }),
    ),
  );
}

async function executeAgentCommand(onDone: LocalJSXCommandOnDone, workspaceRoot: string, args: string): Promise<null> {
  const tokens = parseArgs(args || '');
  const subcommand = tokens[0]?.toLowerCase();
  const runStore = new RunStore(workspaceRoot);
  const orchestrator = new Orchestrator(workspaceRoot);

  if (!subcommand) {
    onDone(
      `Clew Code Agent CLI\n\n` +
        `Usage:\n` +
        `  /agent run "<task>"       - Start a new AI Agent run\n` +
        `  /agent status [run-id]    - View current active runs or run details\n` +
        `  /agent trace <run-id>     - Display full history logs / timeline of events\n` +
        `  /agent pause <run-id>     - Pause a running execution\n` +
        `  /agent resume <run-id>    - Resume a paused or blocked execution\n` +
        `  /agent approvals          - View all open human-in-the-loop approvals\n` +
        `  /agent approve <run-id> <app-id> - Approve a blocked operation\n` +
        `  /agent deny <run-id> <app-id>    - Deny/Cancel a blocked operation\n` +
        `  /agent report <run-id>    - Display run results report\n` +
        `  /agent doctor             - Verify runtime installation & directories`,
      { display: 'system' },
    );
    return null;
  }

  try {
    switch (subcommand) {
      case 'run': {
        const task = tokens.slice(1).join(' ');
        if (!task) {
          onDone('Error: Please specify a task. Example: /agent run "Implement login logic"', { display: 'system' });
          return null;
        }

        onDone(`Initializing agent workspace...\nStarting task: "${task}"...`, { display: 'system' });
        const runId = await orchestrator.startRun(task);
        onDone(`Run created with ID: ${runId}\nExecuting workflow loop...`, { display: 'system' });

        // Run the orchestrator loop
        await orchestrator.runLoop(runId);

        const finalRun = await runStore.loadRun(runId);
        const finalState = await runStore.loadState(runId);

        let finalMsg = `\nAgent run loop paused/stopped. Status: **${finalRun.status.toUpperCase()}**\n`;
        if (finalRun.status === 'completed') {
          finalMsg += `🎉 Success! Summary: ${finalState.taskSummary}\nUse \`/agent report ${runId}\` to see full details.`;
        } else if (finalRun.status === 'failed') {
          finalMsg += `❌ Failed. Reason: ${finalState.taskSummary}`;
        } else if (finalRun.status === 'waiting_approval') {
          finalMsg += `⚠️ Waiting for user approval on step ${finalState.step}.\nUse \`/agent approvals\` or \`/agent status ${runId}\` to view pending actions.`;
        } else {
          finalMsg += `Current step: ${finalState.step}.`;
        }

        onDone(finalMsg, { display: 'system' });
        break;
      }

      case 'status': {
        const targetRunId = tokens[1];
        if (targetRunId) {
          const run = await runStore.loadRun(targetRunId);
          const state = await runStore.loadState(targetRunId);
          let detail = `**Run Detail: ${targetRunId}**\n`;
          detail += `- Task: "${run.task}"\n`;
          detail += `- Workflow: ${run.workflow}\n`;
          detail += `- Status: \`${run.status.toUpperCase()}\`\n`;
          detail += `- Active Agent: **${state.activeAgent}**\n`;
          detail += `- Step: ${state.step} / ${run.budget.maxSteps}\n`;
          detail += `- Changed Files: ${state.changedFiles.join(', ') || 'None'}\n`;
          detail += `- Last Checkpoint: ${state.lastCheckpoint || 'None'}\n`;
          if (state.openApprovals.length > 0) {
            detail += `\n**Pending Approvals:**\n`;
            for (const app of state.openApprovals) {
              detail += `  - **ID:** \`${app.id}\` | Tool: \`${app.tool}\` | Risk: **${app.risk.toUpperCase()}**\n`;
              detail += `    Reason: _${app.reason}_\n`;
              if (app.command) detail += `    Command: \`${app.command}\`\n`;
            }
          }
          onDone(detail, { display: 'system' });
        } else {
          const runs = await runStore.listRuns();
          if (runs.length === 0) {
            onDone('No agent runs found. Start one with `/agent run "<task>"`', { display: 'system' });
            return null;
          }

          let table = `**Agent Runs History**\n\n`;
          table += `| Run ID | Status | Active Agent | Step | Created At | Task |\n`;
          table += `| --- | --- | --- | --- | --- | --- |\n`;
          for (const run of runs) {
            let activeAgent = '-';
            let step = 0;
            try {
              const state = await runStore.loadState(run.id);
              activeAgent = state.activeAgent;
              step = state.step;
            } catch {
              // state file might not exist or is corrupted
            }
            const dateStr = new Date(run.createdAt).toLocaleString();
            const truncatedTask = run.task.length > 40 ? run.task.slice(0, 37) + '...' : run.task;
            table += `| \`${run.id}\` | \`${run.status.toUpperCase()}\` | ${activeAgent} | ${step}/${run.budget.maxSteps} | ${dateStr} | ${truncatedTask} |\n`;
          }
          onDone(table, { display: 'system' });
        }
        break;
      }

      case 'trace': {
        const targetRunId = tokens[1];
        if (!targetRunId) {
          onDone('Error: Please specify a Run ID. Usage: /agent trace <run-id>', { display: 'system' });
          return null;
        }

        const events = await runStore.loadEvents(targetRunId);
        if (events.length === 0) {
          onDone(`No events found for run \`${targetRunId}\`.`, { display: 'system' });
          return null;
        }

        let traceStr = `**Execution Trace for Run: ${targetRunId}**\n\n`;
        for (const evt of events) {
          const time = new Date(evt.timestamp).toLocaleTimeString();
          let dataInfo = '';
          if (evt.type === 'run.started') {
            dataInfo = `Task: "${evt.data?.task || ''}" (Workflow: ${evt.data?.workflowName || ''})`;
          } else if (evt.type === 'agent.started') {
            dataInfo = `Agent **${evt.agent}** started`;
          } else if (evt.type === 'handoff.created') {
            dataInfo = `Handoff from **${evt.data?.from}** to **${evt.data?.to}** (Reason: _${evt.data?.reason || ''}_)`;
          } else if (evt.type === 'tool.completed') {
            dataInfo = `Executed tool \`${evt.tool}\``;
          } else if (evt.type === 'tool.failed') {
            dataInfo = `Failed tool \`${evt.tool}\` | Error: _${evt.data?.error || ''}_`;
          } else if (evt.type === 'approval.requested') {
            dataInfo = `HITL Approval requested for \`${evt.tool}\` (Risk: **${evt.data?.risk}**)`;
          } else if (evt.type === 'approval.approved') {
            dataInfo = `User approved HITL gate \`${evt.data?.approvalId}\``;
          } else if (evt.type === 'approval.denied') {
            dataInfo = `User denied HITL gate \`${evt.data?.approvalId}\``;
          } else if (evt.type === 'checkpoint.saved') {
            dataInfo = `Saved state checkpoint: \`${evt.data?.checkpointName}\``;
          } else if (evt.type === 'run.completed') {
            dataInfo = `🎉 Run Completed: ${evt.data?.summary || ''}`;
          } else if (evt.type === 'run.failed') {
            dataInfo = `❌ Run Failed: ${evt.data?.summary || ''}`;
          } else {
            continue; // Skip noise events like llm.requested/completed to keep trace readable
          }
          traceStr += `[${time}] \`${evt.type.toUpperCase()}\` | ${evt.agent || '-'} | ${dataInfo}\n`;
        }
        onDone(traceStr, { display: 'system' });
        break;
      }

      case 'pause': {
        const targetRunId = tokens[1];
        if (!targetRunId) {
          onDone('Error: Please specify a Run ID. Usage: /agent pause <run-id>', { display: 'system' });
          return null;
        }

        await orchestrator.pauseRun(targetRunId);
        onDone(`Run \`${targetRunId}\` has been paused successfully.`, { display: 'system' });
        break;
      }

      case 'resume': {
        const targetRunId = tokens[1];
        if (!targetRunId) {
          onDone('Error: Please specify a Run ID. Usage: /agent resume <run-id>', { display: 'system' });
          return null;
        }

        onDone(`Resuming run \`${targetRunId}\` in the background...`, { display: 'system' });
        await orchestrator.resumeRun(targetRunId);
        break;
      }

      case 'approvals': {
        const runs = await runStore.listRuns();
        const approvalLines: string[] = [];

        for (const run of runs) {
          if (run.status === 'waiting_approval') {
            try {
              const state = await runStore.loadState(run.id);
              for (const app of state.openApprovals) {
                approvalLines.push(
                  `| \`${run.id}\` | \`${app.id}\` | **${app.risk.toUpperCase()}** | \`${app.tool}\` | _${app.reason}_ |`,
                );
              }
            } catch {
              // Ignore corrupted
            }
          }
        }

        if (approvalLines.length === 0) {
          onDone('No pending human-in-the-loop approvals found! ✨', { display: 'system' });
        } else {
          let table = `**Pending Approvals**\n\n`;
          table += `| Run ID | Approval ID | Risk | Tool | Reason |\n`;
          table += `| --- | --- | --- | --- | --- |\n`;
          table += approvalLines.join('\n');
          table += `\n\nUse \`/agent approve <run-id> <approval-id>\` or \`/agent deny <run-id> <approval-id>\` to decide.`;
          onDone(table, { display: 'system' });
        }
        break;
      }

      case 'approve': {
        const targetRunId = tokens[1];
        const approvalId = tokens[2];
        if (!targetRunId || !approvalId) {
          onDone('Error: Please specify both Run ID and Approval ID. Usage: /agent approve <run-id> <approval-id>', {
            display: 'system',
          });
          return null;
        }

        onDone(`Processing approval for run \`${targetRunId}\`, gate \`${approvalId}\`...`, { display: 'system' });
        await orchestrator.processApproval(targetRunId, approvalId, true);
        onDone(`Gate \`${approvalId}\` approved successfully! Run execution resumed.`, { display: 'system' });
        break;
      }

      case 'deny': {
        const targetRunId = tokens[1];
        const approvalId = tokens[2];
        if (!targetRunId || !approvalId) {
          onDone('Error: Please specify both Run ID and Approval ID. Usage: /agent deny <run-id> <approval-id>', {
            display: 'system',
          });
          return null;
        }

        onDone(`Processing denial for run \`${targetRunId}\`, gate \`${approvalId}\`...`, { display: 'system' });
        await orchestrator.processApproval(targetRunId, approvalId, false);
        onDone(`Gate \`${approvalId}\` denied. Run failed.`, { display: 'system' });
        break;
      }

      case 'report': {
        const targetRunId = tokens[1];
        if (!targetRunId) {
          onDone('Error: Please specify a Run ID. Usage: /agent report <run-id>', { display: 'system' });
          return null;
        }

        const report = await runStore.loadReport(targetRunId);
        onDone(report, { display: 'system' });
        break;
      }

      case 'doctor': {
        let doctorStr = `**Clew Code Agent Runtime Diagnostics**\n\n`;

        const dirs = [
          path.join(workspaceRoot, '.claude'),
          path.join(workspaceRoot, '.claude', 'runs'),
          path.join(workspaceRoot, '.claude', 'agents'),
          path.join(workspaceRoot, '.claude', 'workflows'),
        ];

        for (const dir of dirs) {
          try {
            await fs.mkdir(dir, { recursive: true });
            doctorStr += `✅ Directory is ready: \`${path.relative(workspaceRoot, dir)}\`\n`;
          } catch (err) {
            doctorStr += `❌ Failed to access/create directory \`${path.relative(workspaceRoot, dir)}\` | Error: ${(err as Error).message}\n`;
          }
        }

        // Check agents registered
        try {
          await orchestrator.init();
          doctorStr += `✅ Registries and databases initialized successfully.\n`;
        } catch (err) {
          doctorStr += `❌ Failed to initialize registries | Error: ${(err as Error).message}\n`;
        }

        onDone(doctorStr, { display: 'system' });
        break;
      }

      default:
        onDone(`Error: Unknown subcommand '${subcommand}'. Type \`/agent\` for help.`, { display: 'system' });
    }
  } catch (err) {
    onDone(`❌ CLI Error: ${(err as Error).message}`, { display: 'system' });
  }

  return null;
}
