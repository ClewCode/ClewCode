import { expect, test, describe, beforeAll, afterAll } from 'bun:test';
import { mkdir, rm, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { getFsImplementation } from '../../src/utils/fsOperations.js';

import { Orchestrator, MockLLMAdapter } from '../../src/agentRuntime/orchestrator.js';
import { RunStore, scrubSecrets } from '../../src/agentRuntime/runStore.js';
import { ToolGateway } from '../../src/agentRuntime/toolGateway.js';
import { AgentRegistry } from '../../src/agentRuntime/agentRegistry.js';
import { WorkflowRegistry } from '../../src/agentRuntime/workflowRegistry.js';
import { ReportBuilder } from '../../src/agentRuntime/reportBuilder.js';

const TEST_CWD = join(process.cwd(), 'tests', 'scratch_agent_runtime');

describe('PLAN I — Agent Runtime / Orchestrator Unit Tests', () => {
  beforeAll(async () => {
    const fsImpl = getFsImplementation();
    if (fsImpl.existsSync(TEST_CWD)) {
      await rm(TEST_CWD, { recursive: true });
    }
    await mkdir(TEST_CWD, { recursive: true });
  });

  afterAll(async () => {
    const fsImpl = getFsImplementation();
    if (fsImpl.existsSync(TEST_CWD)) {
      await rm(TEST_CWD, { recursive: true });
    }
  });

  test('Secret Redaction & Scrubbing', () => {
    const raw = 'my openai key is sk-123456789012345678901234567890123456789012345678 and token is ghp_abcdefghijklmnopqrstuvwxyz1234567890';
    const scrubbed = scrubSecrets(raw);
    expect(scrubbed).not.toContain('sk-1234567890');
    expect(scrubbed).not.toContain('ghp_abcdefg');
    expect(scrubbed).toContain('[REDACTED]');
  });

  test('RunStore operations', async () => {
    const store = new RunStore(TEST_CWD);
    await store.init();

    const runId = await store.generateRunId();
    expect(runId).toContain('run-');

    const mockRun = {
      id: runId,
      task: 'Test agent task',
      workflow: 'coding-task',
      status: 'created' as const,
      activeAgent: 'planner',
      workspace: TEST_CWD,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      budget: {
        maxSteps: 10,
        maxToolCalls: 20,
        maxLlmCalls: 10,
        timeoutMs: 10000,
        maxOutputBytesPerTool: 1000,
        maxPatchBytes: 1000,
        maxChangedFiles: 5,
        maxCostUsd: null,
      },
    };

    await store.createRun(mockRun);
    const loadedRun = await store.loadRun(runId);
    expect(loadedRun.task).toBe('Test agent task');

    const state = await store.loadState(runId);
    expect(state.activeAgent).toBe('planner');
    expect(state.step).toBe(0);

    state.step = 2;
    state.changedFiles.push('src/index.ts');
    await store.saveState(runId, state);

    const updatedState = await store.loadState(runId);
    expect(updatedState.step).toBe(2);
    expect(updatedState.changedFiles).toContain('src/index.ts');

    const evt = await store.appendEvent(runId, 'run.started', { detail: 'unit test' }, 'planner');
    expect(evt.type).toBe('run.started');
    expect(evt.agent).toBe('planner');

    const events = await store.loadEvents(runId);
    expect(events.length).toBe(1);
    expect(events[0]!.type).toBe('run.started');
  });

  test('Agent & Workflow Registries initialization & fallback', async () => {
    const agentReg = new AgentRegistry(TEST_CWD);
    const workflowReg = new WorkflowRegistry(TEST_CWD);

    await agentReg.init();
    await workflowReg.init();

    const defaultAgent = await agentReg.loadAgent('planner');
    expect(defaultAgent.name).toBe('planner');
    expect(defaultAgent.tools).toContain('repo.search');

    const defaultWorkflow = await workflowReg.loadWorkflow('coding-task');
    expect(defaultWorkflow.name).toBe('coding-task');
    expect(defaultWorkflow.entry).toBe('planner');
    expect(defaultWorkflow.agents.planner?.next).toContain('coder');
  });

  test('ToolGateway authorization and execution', async () => {
    const store = new RunStore(TEST_CWD);
    await store.init();
    const gateway = new ToolGateway(store, TEST_CWD);

    const plannerAgent = {
      name: 'planner',
      description: 'Planner agent',
      model: 'claude-3-5-sonnet',
      max_steps: 10,
      tools: ['repo.search', 'repo.open'],
      permissions: {
        read_files: 'allow' as const,
        write_files: 'guarded' as const,
        shell: 'deny' as const,
        network: 'deny' as const,
        memory_write: 'deny' as const,
      },
      handoff_to: ['coder'],
    };

    // Authorized tool decision
    const decision1 = await gateway.authorize('run-1', plannerAgent, 'repo.search', { query: 'test' });
    expect(decision1.action).toBe('allow');

    // Unauthorized tool decision
    const decision2 = await gateway.authorize('run-1', plannerAgent, 'shell.run', { command: 'ls' });
    expect(decision2.action).toBe('deny');

    // Guarded patch decision (should request approval)
    const guardedAgent = {
      ...plannerAgent,
      tools: ['repo.patch'],
    };
    const decision3 = await gateway.authorize('run-1', guardedAgent, 'repo.patch', { path: 'test.ts', patch: 'content' });
    expect(decision3.action).toBe('ask_user');
    if (decision3.action === 'ask_user') {
      expect(decision3.risk).toBe('medium');
    }
  });

  test('Orchestrator Execution Loop, HITL & Checkpointing', async () => {
    // Write a mock test file to read
    const testFile = join(TEST_CWD, 'mock-code.ts');
    await writeFile(testFile, 'export const value = 42;\n', 'utf-8');

    const mockLLM = new MockLLMAdapter();
    const orchestrator = new Orchestrator(TEST_CWD, mockLLM);
    await orchestrator.init();

    mockLLM.setPresetActions('planner', [
      {
        type: 'handoff',
        to: 'coder',
        reason: 'Ready to write code',
        summary: 'Planning done',
      },
    ]);

    mockLLM.setPresetActions('coder', [
      {
        type: 'tool_call',
        tool: 'shell.run',
        input: { command: 'echo hello' },
      },
      {
        type: 'tool_call',
        tool: 'repo.patch',
        input: { path: 'mock-code.ts', patch: 'export const value = 100;\n', target: 'export const value = 42;\n' },
      },
      {
        type: 'complete',
        summary: 'Coding completed perfectly.',
      },
    ]);

    const runId = await orchestrator.startRun('Refactor mock-code.ts value');
    expect(runId).toBeDefined();

    // Trigger run loop
    await orchestrator.runLoop(runId);

    const run = await orchestrator.runStore.loadRun(runId);
    // Since coder's shell.run is run under guarded, it should trigger 'waiting_approval'!
    expect(run.status).toBe('waiting_approval');

    const state = await orchestrator.runStore.loadState(runId);
    expect(state.activeAgent).toBe('coder');
    expect(state.openApprovals.length).toBe(1);

    const approval = state.openApprovals[0]!;
    expect(approval.tool).toBe('shell.run');

    // Let's approve it!
    await orchestrator.processApproval(runId, approval.id, true);

    // Poll to wait for the run loop to complete since it runs in the background after processApproval
    let finalRun = await orchestrator.runStore.loadRun(runId);
    let attempts = 0;
    while (finalRun.status === 'running' || finalRun.status === 'waiting_approval') {
      await new Promise(resolve => setTimeout(resolve, 50));
      finalRun = await orchestrator.runStore.loadRun(runId);
      attempts++;
      if (attempts > 100) break; // timeout after 5s
    }

    // Let's check status after resume and run completion
    expect(finalRun.status).toBe('completed');

    const finalState = await orchestrator.runStore.loadState(runId);
    expect(finalState.taskSummary).toBe('Coding completed perfectly.');
    expect(finalState.changedFiles).toContain('mock-code.ts');

    // Verify report got written
    const report = await orchestrator.runStore.loadReport(runId);
    expect(report).toContain('Claude Code Agent Run Report');
    expect(report).toContain('mock-code.ts');
  });
});
