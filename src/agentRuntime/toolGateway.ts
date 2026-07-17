import { exec } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DOT_CLEW } from '../utils/clewPaths.js';
import type { RunStore } from './runStore.js';
import type { AgentDefinition } from './types.js';

const SENSITIVE_COMMAND_SUBSTRINGS = [
  'rm ',
  'sudo ',
  'chmod ',
  'chown ',
  'curl ',
  'wget ',
  'git reset',
  'git clean',
  'git push',
  'npm publish',
  'pnpm publish',
  'bun publish',
];

type ToolDecision =
  | { action: 'allow' }
  | { action: 'deny'; reason: string }
  | { action: 'ask_user'; approvalId: string; reason: string; risk: 'low' | 'medium' | 'high' | 'critical' };

export class ToolGateway {
  private runStore: RunStore;
  private workspaceRoot: string;

  constructor(runStore: RunStore, workspaceRoot: string) {
    this.runStore = runStore;
    this.workspaceRoot = workspaceRoot;
  }

  async authorize(_runId: string, agent: AgentDefinition, toolName: string, input: unknown): Promise<ToolDecision> {
    // 1. Verify agent is allowed to use this tool
    if (!agent.tools.includes(toolName)) {
      return {
        action: 'deny',
        reason: `Agent '${agent.name}' is not authorized to use tool '${toolName}'. Authorized tools: ${agent.tools.join(', ')}`,
      };
    }

    const { permissions } = agent;

    // 2. Classify tool request
    if (toolName.startsWith('repo.')) {
      if (toolName === 'repo.search' || toolName === 'repo.open') {
        if (permissions.read_files === 'deny') {
          return { action: 'deny', reason: `Agent '${agent.name}' is denied read access to the repository files.` };
        }
        return { action: 'allow' };
      }

      if (toolName === 'repo.patch') {
        if (permissions.write_files === 'deny') {
          return { action: 'deny', reason: `Agent '${agent.name}' is denied write access to the repository files.` };
        }
        if (permissions.write_files === 'guarded') {
          const approvalId = `app-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
          return {
            action: 'ask_user',
            approvalId,
            risk: 'medium',
            reason: `Agent '${agent.name}' requested to write/patch files under guarded policy.`,
          };
        }
        return { action: 'allow' };
      }
    }

    if (toolName === 'shell.run') {
      const command = (input as { command?: string })?.command || '';
      if (permissions.shell === 'deny') {
        return { action: 'deny', reason: `Agent '${agent.name}' is denied executing shell commands.` };
      }

      // Check if command contains highly sensitive operations
      const isSensitive = SENSITIVE_COMMAND_SUBSTRINGS.some(sub => command.includes(sub));
      if (isSensitive) {
        const approvalId = `app-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        return {
          action: 'ask_user',
          approvalId,
          risk: 'high',
          reason: `Highly sensitive shell command detected: "${command}"`,
        };
      }

      if (permissions.shell === 'guarded') {
        const approvalId = `app-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        return {
          action: 'ask_user',
          approvalId,
          risk: 'medium',
          reason: `Guarded shell policy requires approval to run command: "${command}"`,
        };
      }

      return { action: 'allow' };
    }

    if (toolName === 'memory.search') {
      return { action: 'allow' };
    }

    if (toolName.startsWith('eval.')) {
      return { action: 'allow' };
    }

    return {
      action: 'deny',
      reason: `Tool '${toolName}' is not recognized or integrated into the Tool Gateway.`,
    };
  }

  async execute(runId: string, agentName: string, toolName: string, input: unknown): Promise<Record<string, unknown>> {
    await this.runStore.appendEvent(runId, 'tool.requested', { input }, agentName, toolName);

    try {
      let output: Record<string, unknown> = {};

      if (toolName === 'repo.search') {
        const { query } = input as { query: string };
        output = await this.executeRepoSearch(query);
      } else if (toolName === 'repo.open') {
        const { path: filePath, startLine, endLine } = input as { path: string; startLine?: number; endLine?: number };
        output = await this.executeRepoOpen(filePath, startLine, endLine);
      } else if (toolName === 'repo.patch') {
        const {
          path: filePath,
          patch,
          replacement,
          target,
        } = input as { path: string; patch?: string; replacement?: string; target?: string };
        output = await this.executeRepoPatch(filePath, patch || replacement || '', target);
      } else if (toolName === 'shell.run') {
        const { command, timeout } = input as { command: string; timeout?: number };
        output = await this.executeShellRun(command, timeout);
      } else if (toolName === 'memory.search') {
        const { query } = input as { query: string };
        output = await this.executeMemorySearch(query);
      } else {
        throw new Error(`Tool execution for '${toolName}' not implemented in Gateway.`);
      }

      await this.runStore.appendEvent(
        runId,
        'tool.completed',
        { summary: this.summarizeOutput(output) },
        agentName,
        toolName,
      );
      return output;
    } catch (err) {
      const errorMsg = (err as Error).message;
      await this.runStore.appendEvent(runId, 'tool.failed', { error: errorMsg }, agentName, toolName);
      throw err;
    }
  }

  private summarizeOutput(out: Record<string, unknown>): string {
    const str = JSON.stringify(out);
    if (str.length <= 150) return str;
    return `${str.slice(0, 150)}... (truncated)`;
  }

  // Gateway Tool Implementations
  private async executeRepoSearch(query: string): Promise<Record<string, unknown>> {
    const results: string[] = [];
    const files = await this.getFilesRecursive(this.workspaceRoot);

    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        if (content.toLowerCase().includes(query.toLowerCase())) {
          results.push(path.relative(this.workspaceRoot, file));
        }
      } catch {
        // Ignore binary or unreadable files
      }
      if (results.length >= 25) break; // limit to first 25
    }

    return { matches: results, totalMatches: results.length };
  }

  private async getFilesRecursive(dir: string): Promise<string[]> {
    const results: string[] = [];
    const list = await fs.readdir(dir, { withFileTypes: true });
    for (const file of list) {
      // Ignore git, node_modules, and claude runs
      if (['.git', 'node_modules', DOT_CLEW, 'dist'].includes(file.name)) continue;

      const res = path.resolve(dir, file.name);
      if (file.isDirectory()) {
        results.push(...(await this.getFilesRecursive(res)));
      } else {
        results.push(res);
      }
    }
    return results;
  }

  private async executeRepoOpen(
    filePath: string,
    startLine?: number,
    endLine?: number,
  ): Promise<Record<string, unknown>> {
    const fullPath = path.resolve(this.workspaceRoot, filePath);
    // Boundary check
    if (!fullPath.startsWith(path.resolve(this.workspaceRoot))) {
      throw new Error(`Permission denied: file path ${filePath} is outside workspace root.`);
    }

    const content = await fs.readFile(fullPath, 'utf-8');
    const lines = content.split('\n');
    const start = Math.max(1, startLine || 1);
    const end = Math.min(lines.length, endLine || lines.length);

    return {
      path: filePath,
      content: lines.slice(start - 1, end).join('\n'),
      startLine: start,
      endLine: end,
      totalLines: lines.length,
    };
  }

  private async executeRepoPatch(filePath: string, patch: string, target?: string): Promise<Record<string, unknown>> {
    const fullPath = path.resolve(this.workspaceRoot, filePath);
    if (!fullPath.startsWith(path.resolve(this.workspaceRoot))) {
      throw new Error(`Permission denied: file path ${filePath} is outside workspace root.`);
    }

    let content = '';
    try {
      content = await fs.readFile(fullPath, 'utf-8');
    } catch {
      // File does not exist yet, we will create it
    }

    let newContent = '';
    if (target) {
      if (!content.includes(target)) {
        throw new Error(`Target content not found in file for patch substitution: "${target}"`);
      }
      newContent = content.replace(target, patch);
    } else {
      // Direct write or custom patch helper
      newContent = patch;
    }

    await fs.writeFile(fullPath, newContent, 'utf-8');
    return { path: filePath, success: true, patchApplied: true };
  }

  private async executeShellRun(command: string, timeoutMs?: number): Promise<Record<string, unknown>> {
    return new Promise((resolve, _reject) => {
      const timeout = timeoutMs || 60000;
      const _child = exec(command, { cwd: this.workspaceRoot, timeout }, (error, stdout, stderr) => {
        resolve({
          exitCode: error ? error.code || 1 : 0,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          failed: !!error,
        });
      });
    });
  }

  private async executeMemorySearch(query: string): Promise<Record<string, unknown>> {
    const results: string[] = [];
    const memoryDir = path.join(this.workspaceRoot, DOT_CLEW, 'memory');
    try {
      const list = await fs.readdir(memoryDir);
      for (const file of list) {
        if (file.endsWith('.md')) {
          const content = await fs.readFile(path.join(memoryDir, file), 'utf-8');
          if (content.toLowerCase().includes(query.toLowerCase())) {
            results.push(file);
          }
        }
      }
    } catch {
      // Memory dir not initialized
    }
    return { matches: results, query };
  }
}
