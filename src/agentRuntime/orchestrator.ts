import { AgentRegistry } from './agentRegistry.js';
import { ReportBuilder } from './reportBuilder.js';
import { RunStore } from './runStore.js';
import { ToolGateway } from './toolGateway.js';
import type {
  AgentAction,
  AgentDefinition,
  AgentRun,
  AgentState,
  ApprovalRequest,
  RuntimeEvent,
  WorkflowDefinition,
} from './types.js';
import { WorkflowRegistry } from './workflowRegistry.js';

interface LLMAdapter {
  nextAction(agent: AgentDefinition, contextText: string, history: RuntimeEvent[]): Promise<AgentAction>;
}

// Highly robust Mock LLM Adapter for deterministic offline tests and fallback
class MockLLMAdapter implements LLMAdapter {
  private presetActions: Record<string, AgentAction[]> = {};
  private actionIndex: Record<string, number> = {};

  setPresetActions(agentName: string, actions: AgentAction[]) {
    this.presetActions[agentName] = actions;
    this.actionIndex[agentName] = 0;
  }

  async nextAction(agent: AgentDefinition, _contextText: string, _history: RuntimeEvent[]): Promise<AgentAction> {
    const name = agent.name;
    const actions = this.presetActions[name] || [];
    const index = this.actionIndex[name] || 0;

    if (index < actions.length) {
      this.actionIndex[name] = index + 1;
      return actions[index]!;
    }

    // Default intelligent fallbacks depending on agent role
    if (name === 'planner') {
      return {
        type: 'handoff',
        to: 'coder',
        reason: 'Plan complete',
        summary: 'Identified target files for modification.',
      };
    }
    if (name === 'coder') {
      return {
        type: 'tool_call',
        tool: 'repo.patch',
        input: { path: 'src/commands/memory/search.ts', patch: '// Edited code\n' },
      };
    }
    if (name === 'tester') {
      return {
        type: 'complete',
        summary: 'All tests passed successfully.',
      };
    }

    return { type: 'complete', summary: 'Orchestrator mock execution finished.' };
  }
}

export class Orchestrator {
  private runStore: RunStore;
  private agentRegistry: AgentRegistry;
  private workflowRegistry: WorkflowRegistry;
  private toolGateway: ToolGateway;
  private llmAdapter: LLMAdapter;
  private workspaceRoot: string;

  constructor(workspaceRoot: string, llmAdapter?: LLMAdapter) {
    this.workspaceRoot = workspaceRoot;
    this.runStore = new RunStore(workspaceRoot);
    this.agentRegistry = new AgentRegistry(workspaceRoot);
    this.workflowRegistry = new WorkflowRegistry(workspaceRoot);
    this.toolGateway = new ToolGateway(this.runStore, workspaceRoot);
    this.llmAdapter = llmAdapter || new MockLLMAdapter();
  }

  async init(): Promise<void> {
    await this.runStore.init();
    await this.agentRegistry.init();
    await this.workflowRegistry.init();
  }

  async startRun(task: string, workflowName: string = 'coding-task'): Promise<string> {
    await this.init();
    const runId = await this.runStore.generateRunId();
    const workflow = await this.workflowRegistry.loadWorkflow(workflowName);

    const run: AgentRun = {
      id: runId,
      task,
      workflow: workflowName,
      status: 'running',
      activeAgent: workflow.entry,
      workspace: this.workspaceRoot,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      budget: {
        maxSteps: workflow.budgets?.maxSteps || 40,
        maxToolCalls: workflow.budgets?.maxToolCalls || 120,
        maxLlmCalls: workflow.budgets?.maxLlmCalls || 40,
        timeoutMs: workflow.budgets?.timeoutMs || 1800000,
        maxOutputBytesPerTool: workflow.budgets?.maxOutputBytesPerTool || 20000,
        maxPatchBytes: workflow.budgets?.maxPatchBytes || 100000,
        maxChangedFiles: workflow.budgets?.maxChangedFiles || 20,
        maxCostUsd: workflow.budgets?.maxCostUsd || null,
      },
    };

    await this.runStore.createRun(run);
    await this.runStore.appendEvent(runId, 'run.started', { task, workflowName });
    await this.runStore.appendEvent(runId, 'agent.started', { agent: workflow.entry }, workflow.entry);

    return runId;
  }

  async resumeRun(runId: string): Promise<void> {
    await this.init();
    const run = await this.runStore.loadRun(runId);
    if (run.status !== 'waiting_approval' && run.status !== 'paused') {
      throw new Error(`Cannot resume run '${runId}' in status '${run.status}'`);
    }

    run.status = 'running';
    run.updatedAt = new Date().toISOString();
    await this.runStore.saveRun(run);

    const state = await this.runStore.loadState(runId);
    state.status = 'running';
    await this.runStore.saveState(runId, state);

    await this.runStore.appendEvent(runId, 'run.started', { resumed: true });

    // Resume core loop in background/async trigger
    this.runLoop(runId).catch(console.error);
  }

  async pauseRun(runId: string): Promise<void> {
    await this.init();
    const run = await this.runStore.loadRun(runId);
    if (run.status !== 'running') {
      throw new Error(`Cannot pause run '${runId}' in status '${run.status}'`);
    }

    run.status = 'paused';
    run.updatedAt = new Date().toISOString();
    await this.runStore.saveRun(run);

    const state = await this.runStore.loadState(runId);
    state.status = 'paused';
    await this.runStore.saveState(runId, state);

    await this.runStore.appendEvent(runId, 'run.paused');
  }

  async cancelRun(runId: string): Promise<void> {
    await this.init();
    const run = await this.runStore.loadRun(runId);
    if (run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') {
      throw new Error(`Cannot cancel run '${runId}' because it is already finished.`);
    }

    run.status = 'cancelled';
    run.updatedAt = new Date().toISOString();
    await this.runStore.saveRun(run);

    const state = await this.runStore.loadState(runId);
    state.status = 'cancelled';
    await this.runStore.saveState(runId, state);

    await this.runStore.appendEvent(runId, 'run.cancelled');
  }

  async processApproval(runId: string, approvalId: string, approve: boolean): Promise<void> {
    await this.init();
    const state = await this.runStore.loadState(runId);
    const approval = state.openApprovals.find(app => app.id === approvalId);

    if (!approval) {
      throw new Error(`Approval gate '${approvalId}' not found for run '${runId}'`);
    }

    await this.runStore.updateApprovalStatus(runId, approvalId, approve ? 'approved' : 'denied');
    await this.runStore.appendEvent(runId, approve ? 'approval.approved' : 'approval.denied', { approvalId });

    // Remove from open list
    state.openApprovals = state.openApprovals.filter(app => app.id !== approvalId);
    await this.runStore.saveState(runId, state);

    if (approve) {
      // Automatically resume run
      const run = await this.runStore.loadRun(runId);
      run.status = 'running';
      await this.runStore.saveRun(run);

      state.status = 'running';
      await this.runStore.saveState(runId, state);

      // Re-trigger execution
      const toolInput = approval.command ? { command: approval.command } : {};
      this.runLoop(runId, { resumeFromToolCall: approval.tool, toolInput }).catch(console.error);
    } else {
      // Terminate run on denied action or handle replan
      await this.terminateRun(runId, 'failed', `Critical action denied by user: ${approval.tool}`);
    }
  }

  async runLoop(runId: string, options?: { resumeFromToolCall?: string; toolInput?: unknown }): Promise<void> {
    let run = await this.runStore.loadRun(runId);
    let state = await this.runStore.loadState(runId);
    const workflow = await this.workflowRegistry.loadWorkflow(run.workflow);

    if (options?.resumeFromToolCall) {
      try {
        const _output = await this.toolGateway.execute(
          runId,
          state.activeAgent,
          options.resumeFromToolCall,
          options.toolInput,
        );
        state.step++;
        await this.runStore.saveState(runId, state);
      } catch (err) {
        await this.terminateRun(runId, 'failed', `Resumed tool call failed: ${(err as Error).message}`);
        return;
      }
    }

    while (run.status === 'running') {
      run = await this.runStore.loadRun(runId);
      state = await this.runStore.loadState(runId);

      if (run.status !== 'running') break;

      // Check budget
      if (state.step >= run.budget.maxSteps) {
        await this.terminateRun(runId, 'failed', 'Max steps budget exceeded.');
        break;
      }

      const agent = await this.agentRegistry.loadAgent(state.activeAgent);
      const contextText = await this.buildAgentContext(run, state, agent, workflow);
      const events = await this.runStore.loadEvents(runId);

      await this.runStore.appendEvent(runId, 'llm.requested', {}, state.activeAgent);
      const action = await this.llmAdapter.nextAction(agent, contextText, events);
      await this.runStore.appendEvent(runId, 'llm.completed', { actionType: action.type }, state.activeAgent);

      if (action.type === 'message') {
        state.step++;
        state.taskSummary = action.content;
        await this.runStore.saveState(runId, state);
      } else if (action.type === 'tool_call') {
        const decision = await this.toolGateway.authorize(runId, agent, action.tool, action.input);

        if (decision.action === 'deny') {
          await this.runStore.appendEvent(
            runId,
            'tool.denied',
            { reason: decision.reason },
            state.activeAgent,
            action.tool,
          );
          // Pass error block back to agent
          state.step++;
          await this.runStore.saveState(runId, state);
        } else if (decision.action === 'ask_user') {
          const appRequest: ApprovalRequest = {
            id: decision.approvalId,
            runId,
            status: 'pending',
            risk: decision.risk,
            tool: action.tool,
            command: (action.input as { command?: string })?.command,
            reason: decision.reason,
            createdAt: new Date().toISOString(),
          };

          state.openApprovals.push(appRequest);
          state.status = 'waiting_approval';
          await this.runStore.saveState(runId, state);

          run.status = 'waiting_approval';
          await this.runStore.saveRun(run);

          await this.runStore.appendApproval(runId, appRequest);
          await this.runStore.appendEvent(
            runId,
            'approval.requested',
            { approvalId: decision.approvalId, risk: decision.risk, tool: action.tool },
            state.activeAgent,
            action.tool,
          );

          // Save checkpoint
          const stepPad = String(state.step).padStart(4, '0');
          const checkpointName = `${stepPad}-${state.activeAgent}-before-${action.tool.replace(/\./g, '-')}`;
          await this.runStore.saveCheckpoint(runId, checkpointName, state);
          state.lastCheckpoint = checkpointName;
          await this.runStore.saveState(runId, state);
          await this.runStore.appendEvent(runId, 'checkpoint.saved', { checkpointName });

          // Pause loop
          break;
        } else {
          // allow
          await this.runStore.appendEvent(runId, 'tool.allowed', {}, state.activeAgent, action.tool);
          try {
            const _out = await this.toolGateway.execute(runId, state.activeAgent, action.tool, action.input);
            state.step++;
            if (action.tool === 'repo.patch') {
              const patchedPath = (action.input as { path: string })?.path;
              if (patchedPath && !state.changedFiles.includes(patchedPath)) {
                state.changedFiles.push(patchedPath);
              }
            }
            await this.runStore.saveState(runId, state);
          } catch (_err) {
            state.step++;
            await this.runStore.saveState(runId, state);
          }
        }
      } else if (action.type === 'handoff') {
        const allowedHandoffs = workflow.agents[state.activeAgent]?.next || [];
        if (!allowedHandoffs.includes(action.to) || !agent.handoff_to.includes(action.to)) {
          await this.runStore.appendEvent(
            runId,
            'tool.failed',
            { error: `Invalid handoff request from ${state.activeAgent} to ${action.to}` },
            state.activeAgent,
          );
          state.step++;
          await this.runStore.saveState(runId, state);
        } else {
          await this.runStore.appendEvent(
            runId,
            'handoff.created',
            { from: state.activeAgent, to: action.to, reason: action.reason },
            state.activeAgent,
          );
          await this.runStore.appendEvent(runId, 'agent.completed', { agent: state.activeAgent }, state.activeAgent);

          // Save checkpoint before handoff
          const stepPad = String(state.step).padStart(4, '0');
          const checkpointName = `${stepPad}-${state.activeAgent}-handoff-to-${action.to}`;
          await this.runStore.saveCheckpoint(runId, checkpointName, state);

          state.activeAgent = action.to;
          state.step++;
          state.lastCheckpoint = checkpointName;
          await this.runStore.saveState(runId, state);

          await this.runStore.appendEvent(runId, 'checkpoint.saved', { checkpointName });
          await this.runStore.appendEvent(runId, 'agent.started', { agent: action.to }, action.to);
        }
      } else if (action.type === 'complete') {
        await this.terminateRun(runId, 'completed', action.summary);
        break;
      } else if (action.type === 'fail') {
        await this.terminateRun(runId, 'failed', action.reason);
        break;
      }
    }
  }

  private async terminateRun(runId: string, status: 'completed' | 'failed', summary: string): Promise<void> {
    const run = await this.runStore.loadRun(runId);
    run.status = status;
    run.updatedAt = new Date().toISOString();
    await this.runStore.saveRun(run);

    const state = await this.runStore.loadState(runId);
    state.status = status;
    state.taskSummary = summary;
    await this.runStore.saveState(runId, state);

    await this.runStore.appendEvent(runId, status === 'completed' ? 'run.completed' : 'run.failed', { summary });

    // Save final checkpoint
    const stepPad = String(state.step).padStart(4, '0');
    const checkpointName = `${stepPad}-final-${status}`;
    await this.runStore.saveCheckpoint(runId, checkpointName, state);

    // Build final report
    const reportBuilder = new ReportBuilder(this.runStore);
    const reportMarkdown = await reportBuilder.build(runId);
    await this.runStore.saveReport(runId, reportMarkdown);
  }

  private async buildAgentContext(
    run: AgentRun,
    state: AgentState,
    agent: AgentDefinition,
    _workflow: WorkflowDefinition,
  ): Promise<string> {
    const budgetRemaining = {
      steps: run.budget.maxSteps - state.step,
      timeLeftMs: run.budget.timeoutMs,
    };

    const contextLines = [
      `<agent_role>`,
      `You are the '${agent.name}' Agent.`,
      agent.systemPrompt || '',
      `</agent_role>`,
      ``,
      `<runtime_state>`,
      `Run ID: ${run.id}`,
      `Task: ${run.task}`,
      `Workflow: ${run.workflow}`,
      `Current Step: ${state.step}`,
      `Steps Remaining: ${budgetRemaining.steps}`,
      `Changed Files: ${state.changedFiles.join(', ') || 'None'}`,
      `</runtime_state>`,
      ``,
      `<policy>`,
      `You must only use the tools explicitly authorized for you: ${agent.tools.join(', ')}`,
      `Allowed Handoff targets: ${agent.handoff_to.join(', ')}`,
      `</policy>`,
      ``,
      `<required_output>`,
      `Return exactly one structured AgentAction JSON block, containing:`,
      `- type: "tool_call" | "handoff" | "complete" | "fail" | "message"`,
      `</required_output>`,
    ];

    return contextLines.join('\n');
  }
}
