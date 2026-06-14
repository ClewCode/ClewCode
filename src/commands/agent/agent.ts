/**
 * /agent command implementation.
 *
 * Unified agent command: dispatch background agents, monitor sessions,
 * manage agent definitions, and control the agent runtime (orchestrator).
 *
 * /agents is registered as an alias and routes here.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type * as React from 'react';
import { Orchestrator } from '../../agentRuntime/orchestrator.js';
import { RunStore } from '../../agentRuntime/runStore.js';
import { AgentsMenu } from '../../components/agents/AgentsMenu.js';
import { AgentViewDashboard } from '../../components/agents/AgentViewDashboard.js';
import type { ToolUseContext } from '../../Tool.js';
import { registerAsyncAgent } from '../../tasks/LocalAgentTask/LocalAgentTask.js';
import { GENERAL_PURPOSE_AGENT } from '../../tools/AgentTool/built-in/generalPurposeAgent.js';
import type { AgentDefinition } from '../../tools/AgentTool/loadAgentsDir.js';
import { getTools } from '../../tools.js';
import type { LocalJSXCommandContext, LocalJSXCommandOnDone } from '../../types/command.js';
import { DOT_CLEW } from '../../utils/clewPaths.js';

const HELP = `AGENT — dispatch Clew internal background specialists from chat

  /agent <task>            dispatch a background specialist
  /agent @<agent> <task>   dispatch with a specific specialist
  /agent view              monitor running agents
  /agent config            manage agent definitions
  /agent run "<task>"      legacy orchestrator workflow
  /agent status [id]       view orchestrator runs
  /agent trace <id>        display execution timeline
  /agent doctor            verify runtime installation

  For external CLIs like Codex, use /mesh run <provider> <task>`;

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

/** Subcommands that route to the legacy orchestrator. */
const ORCHESTRATOR_SUBCOMMANDS = new Set([
  'run',
  'status',
  'trace',
  'pause',
  'resume',
  'approvals',
  'approve',
  'deny',
  'report',
  'doctor',
]);

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: ToolUseContext & LocalJSXCommandContext,
  args: string,
): Promise<React.ReactNode | null> {
  const trimmedArgs = args.trim();
  const argTokens = trimmedArgs.split(/\s+/).filter(Boolean);
  const subcommand = argTokens[0]?.toLowerCase();

  // Handle view/dashboard — returns JSX
  if (subcommand === 'view' || subcommand === 'dashboard') {
    const cwdMatch = trimmedArgs.match(/--cwd\s+(\S+)/);
    const cwd = cwdMatch ? cwdMatch[1] : undefined;
    return React.createElement(AgentViewDashboard, {
      cwd,
      onBack: () => onDone('Agent view dismissed', { display: 'system' }),
    });
  }

  // Handle config/manage — returns JSX
  if (subcommand === 'config' || subcommand === '--config' || subcommand === 'manage') {
    const appState = context.getAppState();
    const permissionContext = appState.toolPermissionContext;
    const tools = getTools(permissionContext);
    return React.createElement(AgentsMenu, { tools, onExit: onDone });
  }

  // Delegate to legacy orchestrator for known subcommands
  if (subcommand && ORCHESTRATOR_SUBCOMMANDS.has(subcommand)) {
    await executeOrchestratorCommand(onDone, args);
    return null;
  }

  // Handle --cwd flag (strip before dispatching)
  const cwdMatch = trimmedArgs.match(/--cwd\s+(\S+)/);
  let taskArgs = cwdMatch ? trimmedArgs.replace(/--cwd\s+\S+\s*/, '').trim() : trimmedArgs;
  const taskTokens = taskArgs.split(/\s+/).filter(Boolean);

  // No args or unknown subcommand — show help
  if (taskTokens.length === 0 || subcommand === 'help' || subcommand === '--help') {
    onDone(HELP, { display: 'system' });
    return null;
  }

  // Background dispatch: parse @agentName or bare agent name prefix
  const agents: AgentDefinition[] = context.options?.agentDefinitions?.activeAgents ?? [];
  let selectedAgent: AgentDefinition | undefined;
  const firstToken = taskTokens[0]!;

  if (firstToken.startsWith('@')) {
    const agentName = firstToken.slice(1);
    selectedAgent = agents.find(a => a.agentType?.toLowerCase() === agentName.toLowerCase());
    taskArgs = taskTokens.slice(1).join(' ').trim();
  } else {
    const matched = agents.find(a => a.agentType?.toLowerCase() === firstToken.toLowerCase());
    if (matched) {
      selectedAgent = matched;
      taskArgs = taskTokens.slice(1).join(' ').trim();
    }
  }

  if (!taskArgs) {
    onDone(HELP, { display: 'system' });
    return null;
  }

  selectedAgent ??= agents[0] ?? GENERAL_PURPOSE_AGENT;

  const agentId = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const taskShort = taskArgs.length > 48 ? `${taskArgs.slice(0, 45)}...` : taskArgs;

  registerAsyncAgent({
    agentId,
    description: taskShort,
    prompt: taskArgs,
    selectedAgent,
    setAppState: context.setAppState,
  });

  onDone(`dispatched ${selectedAgent.agentType} · ${taskShort} · \`${agentId}\`\n  → /agents to track progress`, {
    display: 'system',
  });
  return null;
}

/**
 * Orchestrator subcommand execution (legacy /agent runtime).
 */
async function executeOrchestratorCommand(onDone: LocalJSXCommandOnDone, args: string): Promise<void> {
  const tokens = parseArgs(args || '');
  const subcommand = tokens[0]?.toLowerCase();
  const workspaceRoot = process.cwd();
  const runStore = new RunStore(workspaceRoot);
  const orchestrator = new Orchestrator(workspaceRoot);

  try {
    switch (subcommand) {
      case 'run': {
        const task = tokens.slice(1).join(' ');
        if (!task) {
          onDone('Error: Please specify a task. Example: /agent run "Implement login logic"', { display: 'system' });
          return;
        }

        onDone(`Initializing agent workspace...\nStarting task: "${task}"...`, { display: 'system' });
        const runId = await orchestrator.startRun(task);
        onDone(`Run created with ID: ${runId}\nExecuting workflow loop...`, { display: 'system' });

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
            return;
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
            const truncatedTask = run.task.length > 40 ? `${run.task.slice(0, 37)}...` : run.task;
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
          return;
        }

        const events = await runStore.loadEvents(targetRunId);
        if (events.length === 0) {
          onDone(`No events found for run \`${targetRunId}\`.`, { display: 'system' });
          return;
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
            continue;
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
          return;
        }

        await orchestrator.pauseRun(targetRunId);
        onDone(`Run \`${targetRunId}\` has been paused successfully.`, { display: 'system' });
        break;
      }

      case 'resume': {
        const targetRunId = tokens[1];
        if (!targetRunId) {
          onDone('Error: Please specify a Run ID. Usage: /agent resume <run-id>', { display: 'system' });
          return;
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
          return;
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
          return;
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
          return;
        }

        const report = await runStore.loadReport(targetRunId);
        onDone(report, { display: 'system' });
        break;
      }

      case 'doctor': {
        let doctorStr = `**Clew Code Agent Runtime Diagnostics**\n\n`;

        const dirs = [
          path.join(workspaceRoot, DOT_CLEW),
          path.join(workspaceRoot, DOT_CLEW, 'runs'),
          path.join(workspaceRoot, DOT_CLEW, 'agents'),
          path.join(workspaceRoot, DOT_CLEW, 'workflows'),
        ];

        for (const dir of dirs) {
          try {
            await fs.mkdir(dir, { recursive: true });
            doctorStr += `✅ Directory is ready: \`${path.relative(workspaceRoot, dir)}\`\n`;
          } catch (err) {
            doctorStr += `❌ Failed to access/create directory \`${path.relative(workspaceRoot, dir)}\` | Error: ${(err as Error).message}\n`;
          }
        }

        try {
          await orchestrator.init();
          doctorStr += `✅ Registries and databases initialized successfully.\n`;
        } catch (err) {
          doctorStr += `❌ Failed to initialize registries | Error: ${(err as Error).message}\n`;
        }

        onDone(doctorStr, { display: 'system' });
        break;
      }
    }
  } catch (err) {
    onDone(`❌ CLI Error: ${(err as Error).message}`, { display: 'system' });
  }
}
