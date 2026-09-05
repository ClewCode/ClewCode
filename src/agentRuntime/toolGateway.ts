import { exec } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DOT_CLEW } from '../utils/clewPaths.js';
import type { RunStore } from './runStore.js';
import type { AgentDefinition } from './types.js';

/**
 * Substrings indicating a shell command touches the network. Used to enforce
 * the agent `network` permission — without this, `network: 'deny'` is
 * declarative-only because every agent with `shell: 'allow'` could simply
 * `curl`/`git fetch`/… its way out.
 */
/** Destructive shell patterns — used for `shell.destructive` approval gating. */
const DESTRUCTIVE_COMMAND_PATTERNS = [
  /\brm\s+(-[^\s]*r[^\s]*f|-[^\s]*f[^\s]*r)\b/i, // rm -rf / rm -fr (any flag combo)
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+clean\s+-[^\s]*f[^\s]*d/i,
  /\bgit\s+clean\s+-[^\s]*d[^\s]*f/i,
  /\bgit\s+checkout\s+--\s+\./i,
  /\bmkfs\b/i,
  /\bdd\s+.*\bof=/i,
  /:\(\)\s*\{\s*:\|:\s*&\s*\};:/, // fork bomb
  /\bchmod\s+-R\s+.*\s+\/(\s|$)/,
  /\bchown\s+-R\s+.*\s+\/(\s|$)/,
];

/** True when a shell command touches the network (workflow `shell.network` gating). */
export function isNetworkCommand(command: string): boolean {
  return NETWORK_COMMAND_PATTERNS.some(pattern => pattern.test(command));
}

/** True when a shell command is destructive (workflow `shell.destructive` gating). */
export function isDestructiveCommand(command: string): boolean {
  return DESTRUCTIVE_COMMAND_PATTERNS.some(pattern => pattern.test(command));
}

const NETWORK_COMMAND_PATTERNS = [
  /\bcurl\b/i,
  /\bwget\b/i,
  /\bssh\b/i,
  /\bscp\b/i,
  /\bsftp\b/i,
  /\bftp\b/i,
  /\bgit\s+(fetch|pull|push|clone|ls-remote)\b/i,
  /\bnpm\s+(install|ci|publish|fetch)\b/i,
  /\bpnpm\s+(install|publish|fetch)\b/i,
  /\bbun\s+(install|publish)\b/i,
  /\byarn\s+(install|publish)\b/i,
  /\bpip\s+(install|download)\b/i,
  /\bapt(-get)?\b/i,
  /\b(yum|dnf)\b/i,
  /\bapk\s+add\b/i,
  /\bnc\b/i,
  /\bnetcat\b/i,
  /\btelnet\b/i,
  /\bping\b/i,
  /\bnslookup\b/i,
  /\bdig\b/i,
  /Invoke-WebRequest/i,
];

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

/**
 * Resolve a workspace-relative path and confine it inside the workspace.
 *
 * A bare `resolved.startsWith(root)` check is insufficient: a sibling like
 * `<root>-evil/secret.txt` passes the prefix test. Require a full segment
 * boundary (`root + sep`) instead, then resolve symlinks against the
 * nearest existing ancestor so symlink escapes are caught too.
 *
 * @throws when the path escapes the workspace.
 */
export async function resolveWorkspacePath(workspaceRoot: string, filePath: string): Promise<string> {
  // Windows/macOS resolve the same directory with different casing — compare
  // case-insensitively there to avoid false escape positives.
  const fold =
    process.platform === 'win32' || process.platform === 'darwin' ? (s: string) => s.toLowerCase() : (s: string) => s;
  const inside = (root: string, candidate: string): boolean => {
    const r = fold(root);
    const c = fold(candidate);
    return c === r || c.startsWith(r + path.sep);
  };
  const root = path.resolve(workspaceRoot);
  const fullPath = path.resolve(root, filePath);
  if (!inside(root, fullPath)) {
    throw new Error(`Permission denied: file path ${filePath} is outside workspace root.`);
  }
  // Symlink check: realpath the file itself when it exists, otherwise the
  // nearest existing ancestor (covers repo.patch creating new files).
  let probe = fullPath;
  while (true) {
    try {
      const real = await fs.realpath(probe);
      const suffix = path.relative(probe, fullPath);
      const realFull = suffix ? path.join(real, suffix) : real;
      if (!inside(root, realFull)) {
        throw new Error(`Permission denied: file path ${filePath} escapes the workspace via symlink.`);
      }
      return fullPath;
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error;
      const parent = path.dirname(probe);
      if (parent === probe) throw error; // reached filesystem root
      probe = parent;
    }
  }
}

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

      // Enforce the network permission: without this, `network: 'deny'` is
      // meaningless for any agent with shell access.
      const isNetwork = isNetworkCommand(command);
      if (isNetwork && permissions.network === 'deny') {
        return { action: 'deny', reason: `Agent '${agent.name}' is denied network access: "${command}"` };
      }
      if (isNetwork && permissions.network === 'guarded') {
        const approvalId = `app-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        return {
          action: 'ask_user',
          approvalId,
          risk: 'high',
          reason: `Network access under guarded policy: "${command}"`,
        };
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

    return {
      action: 'deny',
      reason: `Tool '${toolName}' is not recognized or integrated into the Tool Gateway.`,
    };
  }

  async execute(runId: string, agentName: string, toolName: string, input: unknown): Promise<Record<string, unknown>> {
    await this.runStore.appendEvent(runId, 'tool.requested', { input }, agentName, toolName);

    // Byte budgets (best-effort: runs created before budget tracking fall back
    // to workflow defaults via loadRun — budgets are always present on AgentRun).
    const run = await this.runStore.loadRun(runId);
    const { maxOutputBytesPerTool, maxPatchBytes } = run.budget;

    if (toolName === 'repo.patch') {
      const { patch, replacement } = input as { patch?: string; replacement?: string };
      const patchBytes = Buffer.byteLength(patch || replacement || '', 'utf-8');
      if (patchBytes > maxPatchBytes) {
        throw new Error(`Patch size ${patchBytes} bytes exceeds budget of ${maxPatchBytes} bytes.`);
      }
    }

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

      // Cap tool output so one chatty tool cannot blow the agent context.
      const outputJson = JSON.stringify(output);
      if (outputJson.length > maxOutputBytesPerTool) {
        output = {
          truncated: true,
          originalBytes: outputJson.length,
          preview: outputJson.slice(0, maxOutputBytesPerTool),
        };
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
    const fullPath = await resolveWorkspacePath(this.workspaceRoot, filePath);

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
    const fullPath = await resolveWorkspacePath(this.workspaceRoot, filePath);

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
    return new Promise((resolve, reject) => {
      const timeout = timeoutMs || 60000;
      const child = exec(command, { cwd: this.workspaceRoot, timeout }, (error, stdout, stderr) => {
        // BUG #2: Use reject for shell errors instead of resolving with failed:true
        if (error) {
          // Timeout errors should be rejected, not resolved
          if (error.killed) {
            reject(new Error(`Command timeout after ${timeout}ms: ${command}`));
          } else {
            reject(error);
          }
        } else {
          resolve({
            exitCode: 0,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            failed: false,
          });
        }
      });
      // BUG #10: Explicitly kill child process on timeout (timeout option alone may not fully clean up)
      const timeoutHandle = setTimeout(() => {
        if (child && child.exitCode === null) {
          child.kill('SIGKILL');
        }
      }, timeout);
      // Clear timeout if command completes before timeout
      child.on('exit', () => {
        clearTimeout(timeoutHandle);
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
