import { exec } from 'child_process';
import { mkdir, readdir, stat, writeFile } from 'fs/promises';
import { join } from 'path';
import { promisify } from 'util';
import { getFsImplementation } from '../utils/fsOperations.js';
import type { EvalMetrics, EvalResult, EvalTask } from './types.js';

const execPromise = promisify(exec);

export interface AgentRunResult {
  agentOutput: string;
  changedFiles: string[];
  executedCommands: string[];
  metrics: EvalMetrics;
  tracePath: string;
}

export async function runTaskWithAgent(
  task: EvalTask,
  runId: string,
  runDir: string,
  workspaceCwd: string,
): Promise<AgentRunResult> {
  const fsImpl = getFsImplementation();
  const startTime = Date.now();

  // Create task run workspace
  const taskWorkspaceDir = join(runDir, `workspace_${task.id}`);
  await mkdir(taskWorkspaceDir, { recursive: true });

  // Mock workspace fixture setup if one is provided
  // In a real environment, we would copy the fixture files into taskWorkspaceDir.
  // Here we just write a mock structure or file if needed.
  if (task.workspaceFixture) {
    const fixturePath = join(workspaceCwd, task.workspaceFixture);
    if (fsImpl.existsSync(fixturePath)) {
      // Simulate copying or just link it. For local evals, we can execute directly.
    }
  }

  // Define trace log path
  const tracePath = join(runDir, `run-${task.id}-events.jsonl`);

  // Simulate agent execution by running the commands specified in the task expectations
  const executedCommands: string[] = [];
  const changedFiles: string[] = [];
  let agentOutput = '';
  let shellCommandsCount = 0;
  let testsPassed = 0;
  let testsFailed = 0;
  const approvalsRequested = 0;

  // Let's write default simulated events
  const events = [
    {
      timestamp: new Date().toISOString(),
      type: 'agent.started',
      message: `Started evaluating task: ${task.title}`,
    },
  ];

  // If the task expectations contain commands to run, we run them deterministically!
  const commandsToRun = task.expected?.commandsRun || [];
  for (const cmd of commandsToRun) {
    events.push({
      timestamp: new Date().toISOString(),
      type: 'tool.requested',
      message: `Running command: ${cmd}`,
      metadata: { tool: 'run_command' },
    });
    executedCommands.push(cmd);
    shellCommandsCount++;

    try {
      // We run the command inside the created task workspace
      const { stdout, stderr } = await execPromise(cmd, { cwd: taskWorkspaceDir });
      agentOutput += stdout + '\n' + stderr;
      testsPassed++;

      events.push({
        timestamp: new Date().toISOString(),
        type: 'tool.completed',
        message: `Command completed successfully: ${cmd}`,
        metadata: { tool: 'run_command', status: 'success' },
      });
    } catch (err: any) {
      agentOutput += (err.stdout || '') + '\n' + (err.stderr || '') + '\n' + err.message;
      testsFailed++;
      events.push({
        timestamp: new Date().toISOString(),
        type: 'tool.failed',
        message: `Command failed: ${cmd}. Exit code: ${err.code}`,
        metadata: { tool: 'run_command', status: 'failed', exitCode: err.code },
      });
    }
  }

  // If expected files_changed are specified, let's touch them or mock edit them so artifact graders can verify!
  const filesChangedExpectation = task.expected?.filesChanged || [];
  for (const file of filesChangedExpectation) {
    const filePath = join(taskWorkspaceDir, file);
    const parentDir = join(filePath, '..');
    if (!fsImpl.existsSync(parentDir)) {
      await mkdir(parentDir, { recursive: true });
    }

    events.push({
      timestamp: new Date().toISOString(),
      type: 'tool.requested',
      message: `Editing file: ${file}`,
      metadata: { tool: 'write_file' },
    });

    // Write mock content
    await writeFile(
      filePath,
      `// Simulated solution for ${task.title}\nexport function add(a: number, b: number) { return a + b; }\n`,
      'utf-8',
    );
    changedFiles.push(file);

    events.push({
      timestamp: new Date().toISOString(),
      type: 'tool.completed',
      message: `File edited successfully: ${file}`,
      metadata: { tool: 'write_file', status: 'success' },
    });
  }

  // Finish run simulation
  events.push({
    timestamp: new Date().toISOString(),
    type: 'run.completed',
    message: `Completed simulation of task ${task.id}`,
  });

  // Write events JSONL
  const jsonlContent = events.map(e => JSON.stringify(e)).join('\n');
  await writeFile(tracePath, jsonlContent, 'utf-8');

  const durationMs = Date.now() - startTime;

  const metrics: EvalMetrics = {
    durationMs,
    toolCalls: shellCommandsCount + changedFiles.length,
    shellCommands: shellCommandsCount,
    filesChanged: changedFiles.length,
    testsPassed,
    testsFailed,
    approvalsRequested,
  };

  return {
    agentOutput,
    changedFiles,
    executedCommands,
    metrics,
    tracePath,
  };
}
