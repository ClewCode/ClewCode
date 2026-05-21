import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveRuntimePath } from './config.js';
import type { AgentRun, AgentState, ApprovalRequest, RuntimeEvent } from './types.js';

export function scrubSecrets(input: string): string {
  if (!input) return input;
  let scrubbed = input;
  // Regex pattern for typical API keys, tokens, auth headers
  const patterns = [
    /(sk-[a-zA-Z0-9]{48})/g, // OpenAI API Keys
    /(key-[a-zA-Z0-9]{32})/g,
    /(ghp_[a-zA-Z0-9]{36})/g, // GitHub personal access token
    /(bearer\s+[a-zA-Z0-9\-_.~+/]+=*)/gi, // Bearer Token
    /(basic\s+[a-zA-Z0-9\-_.~+/]+=*)/gi, // Basic Auth
    /("api_?key"\s*:\s*")[^"]+(")/gi, // JSON API key value
    /("token"\s*:\s*")[^"]+(")/gi, // JSON token value
    /("password"\s*:\s*")[^"]+(")/gi, // JSON password value
    /("secret"\s*:\s*")[^"]+(")/gi, // JSON secret value
  ];

  for (const pattern of patterns) {
    scrubbed = scrubbed.replace(pattern, (match, p1, p2) => {
      if (p1 && typeof p2 === 'string') {
        return `${p1}[REDACTED]${p2}`;
      }
      return '[REDACTED]';
    });
  }
  return scrubbed;
}

export class RunStore {
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  private getRunsDir(): string {
    return resolveRuntimePath(this.workspaceRoot, 'runs');
  }

  private getRunDir(runId: string): string {
    return path.join(this.getRunsDir(), runId);
  }

  async init(): Promise<void> {
    await fs.mkdir(this.getRunsDir(), { recursive: true });
  }

  async generateRunId(): Promise<string> {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    let counter = 1;
    await this.init();

    while (true) {
      const runId = `run-${dateStr}-${String(counter).padStart(3, '0')}`;
      const runPath = this.getRunDir(runId);
      try {
        await fs.access(runPath);
        counter++;
      } catch {
        return runId;
      }
    }
  }

  async createRun(run: AgentRun): Promise<void> {
    const runDir = this.getRunDir(run.id);
    await fs.mkdir(runDir, { recursive: true });
    await fs.mkdir(path.join(runDir, 'checkpoints'), { recursive: true });

    await this.saveRun(run);

    const initialState: AgentState = {
      runId: run.id,
      status: run.status,
      step: 0,
      activeAgent: run.activeAgent,
      phase: 'init',
      taskSummary: '',
      knownFiles: [],
      changedFiles: [],
      openApprovals: [],
    };
    await this.saveState(run.id, initialState);
  }

  async saveRun(run: AgentRun): Promise<void> {
    const runDir = this.getRunDir(run.id);
    await fs.mkdir(runDir, { recursive: true });
    const runPath = path.join(runDir, 'run.json');
    const sanitizedRun = JSON.parse(scrubSecrets(JSON.stringify(run)));
    await fs.writeFile(runPath, JSON.stringify(sanitizedRun, null, 2), 'utf-8');
  }

  async loadRun(runId: string): Promise<AgentRun> {
    const runPath = path.join(this.getRunDir(runId), 'run.json');
    const data = await fs.readFile(runPath, 'utf-8');
    return JSON.parse(data) as AgentRun;
  }

  async saveState(runId: string, state: AgentState): Promise<void> {
    const statePath = path.join(this.getRunDir(runId), 'state.json');
    const sanitizedState = JSON.parse(scrubSecrets(JSON.stringify(state)));
    await fs.writeFile(statePath, JSON.stringify(sanitizedState, null, 2), 'utf-8');
  }

  async loadState(runId: string): Promise<AgentState> {
    const statePath = path.join(this.getRunDir(runId), 'state.json');
    const data = await fs.readFile(statePath, 'utf-8');
    return JSON.parse(data) as AgentState;
  }

  async listRuns(): Promise<AgentRun[]> {
    await this.init();
    try {
      const entries = await fs.readdir(this.getRunsDir(), { withFileTypes: true });
      const runs: AgentRun[] = [];

      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('run-')) {
          try {
            const run = await this.loadRun(entry.name);
            runs.push(run);
          } catch {
            // Ignore corrupted runs
          }
        }
      }
      return runs.sort((a, b) => b.id.localeCompare(a.id));
    } catch {
      return [];
    }
  }

  async appendEvent(
    runId: string,
    eventType: RuntimeEvent['type'],
    data?: Record<string, unknown>,
    agent?: string,
    tool?: string,
  ): Promise<RuntimeEvent> {
    const eventDir = this.getRunDir(runId);
    const eventsPath = path.join(eventDir, 'events.jsonl');
    const event: RuntimeEvent = {
      id: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      runId,
      type: eventType,
      timestamp: new Date().toISOString(),
      agent,
      tool,
      data,
    };

    const sanitizedEvent = scrubSecrets(JSON.stringify(event));
    await fs.appendFile(eventsPath, sanitizedEvent + '\n', 'utf-8');
    return JSON.parse(sanitizedEvent) as RuntimeEvent;
  }

  async loadEvents(runId: string): Promise<RuntimeEvent[]> {
    const eventsPath = path.join(this.getRunDir(runId), 'events.jsonl');
    try {
      const data = await fs.readFile(eventsPath, 'utf-8');
      return data
        .split('\n')
        .filter(line => line.trim().length > 0)
        .map(line => JSON.parse(line) as RuntimeEvent);
    } catch {
      return [];
    }
  }

  async saveCheckpoint(runId: string, checkpointName: string, state: AgentState): Promise<void> {
    const checkpointPath = path.join(this.getRunDir(runId), 'checkpoints', `${checkpointName}.json`);
    const sanitizedState = JSON.parse(scrubSecrets(JSON.stringify(state)));
    await fs.writeFile(checkpointPath, JSON.stringify(sanitizedState, null, 2), 'utf-8');
  }

  async loadCheckpoint(runId: string, checkpointName: string): Promise<AgentState> {
    const checkpointPath = path.join(this.getRunDir(runId), 'checkpoints', `${checkpointName}.json`);
    const data = await fs.readFile(checkpointPath, 'utf-8');
    return JSON.parse(data) as AgentState;
  }

  async listCheckpoints(runId: string): Promise<string[]> {
    const checkpointsDir = path.join(this.getRunDir(runId), 'checkpoints');
    try {
      const files = await fs.readdir(checkpointsDir);
      return files
        .filter(file => file.endsWith('.json'))
        .map(file => file.replace('.json', ''))
        .sort();
    } catch {
      return [];
    }
  }

  async saveReport(runId: string, reportMarkdown: string): Promise<void> {
    const reportPath = path.join(this.getRunDir(runId), 'report.md');
    await fs.writeFile(reportPath, scrubSecrets(reportMarkdown), 'utf-8');
  }

  async loadReport(runId: string): Promise<string> {
    const reportPath = path.join(this.getRunDir(runId), 'report.md');
    return await fs.readFile(reportPath, 'utf-8');
  }

  async appendApproval(runId: string, approval: ApprovalRequest): Promise<void> {
    const approvalsPath = path.join(this.getRunDir(runId), 'approvals.jsonl');
    const sanitizedApproval = scrubSecrets(JSON.stringify(approval));
    await fs.appendFile(approvalsPath, sanitizedApproval + '\n', 'utf-8');
  }

  async loadApprovals(runId: string): Promise<ApprovalRequest[]> {
    const approvalsPath = path.join(this.getRunDir(runId), 'approvals.jsonl');
    try {
      const data = await fs.readFile(approvalsPath, 'utf-8');
      return data
        .split('\n')
        .filter(line => line.trim().length > 0)
        .map(line => JSON.parse(line) as ApprovalRequest);
    } catch {
      return [];
    }
  }

  async updateApprovalStatus(runId: string, approvalId: string, status: ApprovalRequest['status']): Promise<void> {
    const approvals = await this.loadApprovals(runId);
    const updated = approvals.map(app => {
      if (app.id === approvalId) {
        return { ...app, status };
      }
      return app;
    });

    const approvalsPath = path.join(this.getRunDir(runId), 'approvals.jsonl');
    const lines = updated.map(app => JSON.stringify(app)).join('\n') + '\n';
    await fs.writeFile(approvalsPath, lines, 'utf-8');
  }
}
