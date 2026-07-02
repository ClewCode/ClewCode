import * as fs from 'node:fs';
import * as path from 'node:path';
import { type SpawnOptionsWithoutStdio, spawn } from 'child_process';
import * as pty from 'node-pty';

export type ProcessPeerTask = {
  prompt: string;
  cwd?: string;
  model?: string;
  timeoutMs?: number;
  mode?: ProcessPeerMode;
  abortSignal?: AbortSignal;
  onProgress?: (progress: ProcessPeerProgressEvent) => void;
  /** Resume an existing codex session instead of starting fresh. */
  sessionId?: string;
};

export type ProcessPeerMode = 'exec' | 'pty';

export type ProcessPeerProgressEvent = {
  providerId: string;
  mode: ProcessPeerMode;
  command: string;
  displayCommand: string;
  args: string[];
  cwd: string;
  elapsedMs: number;
  outputTail?: string;
  status: 'starting' | 'running' | 'complete' | 'failed';
};

export type ProcessPeerResult = {
  providerId: string;
  mode: ProcessPeerMode;
  command: string;
  args: string[];
  cwd: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  durationMs: number;
  /** Codex session ID from thread.started JSONL event. Used to resume multi-turn conversations. */
  sessionId?: string;
};

export type ProcessPeerProviderConfig = {
  id: string;
  label: string;
  command: string;
  defaultTimeoutMs?: number;
  maxOutputBytes?: number;
  buildArgs: (task: ProcessPeerTask) => string[];
  buildPtyArgs?: (task: ProcessPeerTask) => string[];
  buildStdin?: (task: ProcessPeerTask) => string | undefined;
  /** Optional: transform raw stdout before it's used for progress display and the final result.
   *  E.g., parse JSONL output to extract human-readable text. */
  formatOutput?: (raw: string) => string;
  /** Optional: extract a session/conversation ID from the raw output for multi-turn support.
   *  E.g., parse the codex JSONL `thread.started` event for `thread_id`. */
  extractSessionId?: (raw: string) => string | undefined;
};

export class ProcessPeerProvider {
  readonly id: string;
  readonly label: string;
  private readonly command: string;
  private readonly defaultTimeoutMs: number;
  private readonly maxOutputBytes: number;
  private readonly buildArgs: (task: ProcessPeerTask) => string[];
  private readonly buildPtyArgs: ((task: ProcessPeerTask) => string[]) | undefined;
  private readonly buildStdin: ((task: ProcessPeerTask) => string | undefined) | undefined;
  private readonly formatOutput: ((raw: string) => string) | undefined;
  private readonly extractSessionId: ((raw: string) => string | undefined) | undefined;

  constructor(config: ProcessPeerProviderConfig) {
    this.id = config.id;
    this.label = config.label;
    this.command = config.command;
    this.defaultTimeoutMs = config.defaultTimeoutMs ?? 10 * 60_000;
    this.maxOutputBytes = config.maxOutputBytes ?? 1024 * 1024;
    this.buildArgs = config.buildArgs;
    this.buildPtyArgs = config.buildPtyArgs;
    this.buildStdin = config.buildStdin;
    this.formatOutput = config.formatOutput;
    this.extractSessionId = config.extractSessionId;
  }

  async runTask(task: ProcessPeerTask): Promise<ProcessPeerResult> {
    const prompt = task.prompt.trim();
    if (!prompt) {
      throw new Error(`${this.label} peer task is empty`);
    }

    const startedAt = Date.now();
    const cwd = task.cwd ?? process.cwd();
    let mode = task.mode ?? 'exec';
    // node-pty has a known "Socket is closed" crash on Windows when the spawned
    // process exits. Fall back to exec mode (child_process.spawn) to avoid it.
    if (mode === 'pty' && process.platform === 'win32') {
      mode = 'exec';
    }
    const args =
      mode === 'pty' && this.buildPtyArgs
        ? this.buildPtyArgs({ ...task, prompt })
        : this.buildArgs({ ...task, prompt });
    const timeoutMs = task.timeoutMs ?? this.defaultTimeoutMs;
    const abortSignal = task.abortSignal;
    if (abortSignal?.aborted) {
      throw new Error(`${this.label} peer task was cancelled before it started`);
    }
    if (mode === 'pty') {
      return await this.runPtyTask({ ...task, prompt, cwd, timeoutMs, args, startedAt });
    }

    return await new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let timedOut = false;
      let settled = false;
      let abortHandler: (() => void) | undefined;
      task.onProgress?.({
        providerId: this.id,
        mode,
        command: this.command,
        displayCommand: formatCommandForDisplay(this.command, args),
        args,
        cwd,
        elapsedMs: 0,
        status: 'starting',
      });

      const spawnOptions: SpawnOptionsWithoutStdio = {
        cwd,
        env: process.env,
        windowsHide: true,
      };
      const child = spawn(this.command, args, {
        ...spawnOptions,
        shell: shouldUseShellForCommand(this.command),
      });
      const stdin = this.buildStdin?.({ ...task, prompt, mode });
      if (stdin !== undefined) {
        child.stdin?.end(stdin);
      } else {
        child.stdin?.end();
      }

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
      }, timeoutMs);
      const progressTimer = setInterval(() => emitProgress('running'), 500);
      if (abortSignal) {
        abortHandler = () => {
          child.kill('SIGTERM');
        };
        abortSignal.addEventListener('abort', abortHandler, { once: true });
      }

      const appendOutput = (current: string, currentBytes: number, chunk: Buffer): [string, number] => {
        if (currentBytes >= this.maxOutputBytes) return [current, currentBytes];
        const availableBytes = this.maxOutputBytes - currentBytes;
        const nextChunk = chunk.byteLength > availableBytes ? chunk.subarray(0, availableBytes) : chunk;
        return [current + nextChunk.toString('utf8'), currentBytes + nextChunk.byteLength];
      };

      const getDisplayOutput = (): string => {
        const formattedStdout = this.formatOutput ? this.formatOutput(stdout) : stdout;
        // When formatOutput is active (e.g. codex --json), stderr is just MCP/skill noise.
        // Show only the clean formatted output for a flowing terminal experience.
        if (this.formatOutput) return formattedStdout;
        return [formattedStdout, stderr].filter(Boolean).join('\n');
      };

      const emitProgress = (status: ProcessPeerProgressEvent['status']): void => {
        task.onProgress?.({
          providerId: this.id,
          mode,
          command: this.command,
          displayCommand: formatCommandForDisplay(this.command, args),
          args,
          cwd,
          elapsedMs: Date.now() - startedAt,
          outputTail: getDisplayOutput(),
          status,
        });
      };

      child.stdout?.on('data', chunk => {
        [stdout, stdoutBytes] = appendOutput(stdout, stdoutBytes, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        emitProgress('running');
      });

      child.stderr?.on('data', chunk => {
        [stderr, stderrBytes] = appendOutput(stderr, stderrBytes, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        emitProgress('running');
      });

      child.on('error', err => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        clearInterval(progressTimer);
        if (abortSignal && abortHandler) {
          abortSignal.removeEventListener('abort', abortHandler);
        }
        reject(err);
      });

      child.on('close', (exitCode, signal) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        clearInterval(progressTimer);
        if (abortSignal && abortHandler) {
          abortSignal.removeEventListener('abort', abortHandler);
        }
        const status = exitCode === 0 && !timedOut ? 'complete' : 'failed';
        resolve({
          providerId: this.id,
          mode,
          command: this.command,
          args,
          cwd,
          stdout: this.formatOutput ? this.formatOutput(stdout) : stdout,
          stderr,
          sessionId: this.extractSessionId ? this.extractSessionId(stdout) : undefined,
          exitCode,
          signal,
          timedOut,
          durationMs: Date.now() - startedAt,
        });
        emitProgress(status);
      });
    });
  }

  private async runPtyTask({
    prompt,
    cwd,
    timeoutMs,
    args,
    startedAt,
    onProgress,
    abortSignal,
  }: ProcessPeerTask & {
    prompt: string;
    cwd: string;
    timeoutMs: number;
    args: string[];
    startedAt: number;
  }): Promise<ProcessPeerResult> {
    return await new Promise((resolve, reject) => {
      let stdout = '';
      let stdoutBytes = 0;
      let timedOut = false;
      let settled = false;
      let progressTimer: NodeJS.Timeout | undefined;
      let abortHandler: (() => void) | undefined;

      const appendOutput = (current: string, currentBytes: number, chunk: string): [string, number] => {
        if (currentBytes >= this.maxOutputBytes) return [current, currentBytes];
        const buffer = Buffer.from(chunk);
        const availableBytes = this.maxOutputBytes - currentBytes;
        const nextChunk =
          buffer.byteLength > availableBytes ? buffer.subarray(0, availableBytes).toString('utf8') : chunk;
        return [current + nextChunk, currentBytes + Buffer.byteLength(nextChunk)];
      };

      const displayCommand = formatCommandForDisplay(this.command, args);
      const emitProgress = (status: ProcessPeerProgressEvent['status']): void => {
        onProgress?.({
          providerId: this.id,
          mode: 'pty',
          command: this.command,
          displayCommand,
          args,
          cwd,
          elapsedMs: Date.now() - startedAt,
          outputTail: stdout,
          status,
        });
      };

      emitProgress('starting');

      const ptyCommand = getPtyCommand(this.command, args);
      let shell: pty.IPty;
      try {
        shell = pty.spawn(ptyCommand.command, ptyCommand.args, {
          name: 'xterm-256color',
          cols: 120,
          rows: 30,
          cwd,
          env: { ...(process.env as Record<string, string>), TERM: 'xterm-256color' },
          handleFlowControl: true,
        });
      } catch (err) {
        reject(err);
        return;
      }

      const stdin = this.buildStdin?.({ prompt, cwd, timeoutMs, args, startedAt, mode: 'pty' });
      if (stdin !== undefined) {
        shell.write(stdin);
        if (!stdin.endsWith('\n')) {
          shell.write('\r');
        }
      }

      const timer = setTimeout(() => {
        timedOut = true;
        shell.kill();
      }, timeoutMs);
      if (abortSignal) {
        abortHandler = () => {
          shell.kill();
        };
        abortSignal.addEventListener('abort', abortHandler, { once: true });
      }
      progressTimer = setInterval(() => emitProgress('running'), 500);

      shell.onData(data => {
        if (settled) return;
        [stdout, stdoutBytes] = appendOutput(stdout, stdoutBytes, data);
        emitProgress('running');
      });

      shell.onExit(({ exitCode, signal }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        clearInterval(progressTimer);
        if (abortSignal && abortHandler) {
          abortSignal.removeEventListener('abort', abortHandler);
        }
        const durationMs = Date.now() - startedAt;
        emitProgress(exitCode === 0 && !timedOut ? 'complete' : 'failed');
        resolve({
          providerId: this.id,
          mode: 'pty',
          command: this.command,
          args,
          cwd,
          stdout: this.formatOutput ? this.formatOutput(stripAnsi(stdout)) : stripAnsi(stdout),
          stderr: '',
          sessionId: this.extractSessionId ? this.extractSessionId(stdout) : undefined,
          exitCode,
          signal: signal as NodeJS.Signals | null,
          timedOut,
          durationMs,
        });
      });
    });
  }
}

export function buildCodexExecArgs(task: ProcessPeerTask): string[] {
  const base = ['exec', '-C', task.cwd ?? process.cwd(), '--color', 'never', '--ignore-user-config', '--json'];
  if (task.model) base.push('-m', task.model);
  if (task.sessionId) {
    // Resume existing session: codex exec resume <id> <prompt>
    base.push('resume', task.sessionId);
  }
  // On Windows, codex runs via cmd.exe (no .exe extension). Passing prompt via stdin
  // gets eaten by cmd.exe. Use CLI arg instead, same as PTY mode.
  base.push(task.prompt);
  return base;
}

export function buildCodexPtyArgs(task: ProcessPeerTask): string[] {
  const base = ['exec', '-C', task.cwd ?? process.cwd(), '--color', 'always', '--ignore-user-config'];
  if (task.model) base.push('-m', task.model);
  if (task.sessionId) {
    base.push('resume', task.sessionId);
  }
  base.push(task.prompt);
  return base;
}

/** Extract the `thread_id` from a codex JSONL `thread.started` event. */
export function extractCodexSessionId(raw: string): string | undefined {
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (event.type === 'thread.started' && event.thread_id) {
        return event.thread_id;
      }
    } catch {
      // skip unparseable lines
    }
  }
  return undefined;
}

/** Parse codex `--json` JSONL output and return only the human-readable agent messages. */
export function formatCodexJsonlOutput(raw: string): string {
  const messages: string[] = [];
  const lines = raw.split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (event.type === 'item.completed' && event.item?.type === 'agent_message' && event.item.text) {
        messages.push(event.item.text);
      }
    } catch {
      // skip unparseable lines (e.g. stray stderr mixed in)
    }
  }
  return messages.join('\n').trim() || raw;
}

function shouldUseShellForCommand(command: string): boolean {
  if (process.platform !== 'win32') return false;
  // .exe, .com, .cmd, .bat are directly executable by Windows without cmd.exe wrapper.
  // Using cmd.exe wrapper breaks stdin piping and argument passing on Windows.
  return !/\.(exe|com|cmd|bat)$/i.test(command);
}

function getPtyCommand(command: string, args: string[]): { command: string; args: string[] } {
  if (!shouldUseShellForCommand(command)) {
    return { command, args };
  }
  return {
    command: process.env.ComSpec || 'cmd.exe',
    args: ['/d', '/s', '/c', command, ...args],
  };
}

export function createCodexExecPeerProvider(command = process.env.CLEW_CODEX_COMMAND || 'codex'): ProcessPeerProvider {
  return new ProcessPeerProvider({
    id: 'codex',
    label: 'Codex',
    command: resolveWindowsCommand(command),
    buildArgs: buildCodexExecArgs,
    buildPtyArgs: buildCodexPtyArgs,
    // Both exec and pty pass prompt as a CLI argument to avoid stdin issues on Windows.
    buildStdin: () => undefined,
    formatOutput: formatCodexJsonlOutput,
    extractSessionId: extractCodexSessionId,
  });
}

/** On Windows, resolve a bare command to its .cmd/.exe path so Node.js
 *  can spawn it directly without a cmd.exe wrapper (which breaks pipes).
 *  On non-Windows, returns the command as-is. */
function resolveWindowsCommand(command: string): string {
  if (process.platform !== 'win32') return command;
  // Already has an executable extension, use as-is.
  if (/\.(exe|com|cmd|bat)$/i.test(command)) return command;
  const pathDirs = (process.env.PATH || '').split(path.delimiter);
  for (const ext of ['.cmd', '.exe', '.bat', '.com']) {
    for (const dir of pathDirs) {
      try {
        const fp = path.join(dir, command + ext);
        if (fs.existsSync(fp)) return fp;
      } catch {
        // skip inaccessible directories
      }
    }
  }
  return command; // fallback to original
}

// ponytail: dynamic registry + PATH detection — data-driven, no hardcoded if/else
const providerRegistry = new Map<string, ProcessPeerProvider>();

type KnownTool = {
  id: string;
  label: string;
  command: string;
  /** CLI args before the prompt (empty = pipe via stdin) */
  args?: string[];
};

const KNOWN_AI_TOOLS: KnownTool[] = [
  { id: 'codex', label: 'Codex', command: 'codex' },
  { id: 'opencode', label: 'OpenCode', command: 'opencode' },
  { id: 'claude', label: 'Claude Code', command: 'claude' },
  { id: 'code', label: 'Claude Code', command: 'code' },
];

function toolExistsOnPath(tool: string): boolean {
  const pathDirs = (process.env.PATH || '').split(path.delimiter);
  return pathDirs.some(dir => {
    try {
      const fp = path.join(dir, tool);
      return fs.existsSync(fp) || fs.existsSync(`${fp}.exe`) || fs.existsSync(`${fp}.cmd`);
    } catch {
      return false;
    }
  });
}

function createProviderForTool(tool: KnownTool): ProcessPeerProvider {
  if (tool.id === 'codex') {
    return createCodexExecPeerProvider(tool.command);
  }

  const command = resolveWindowsCommand(tool.command);
  const args = tool.args;
  // ponytail: args = pass prompt as argument; no args = pipe via stdin
  return new ProcessPeerProvider({
    id: tool.id,
    label: tool.label,
    command,
    buildArgs: task => (args ? [...args, task.prompt] : []),
    buildStdin: task => (args ? undefined : task.prompt),
  });
}

export function registerProcessPeerProvider(provider: ProcessPeerProvider): void {
  providerRegistry.set(provider.id, provider);
}

export function discoverProcessPeerProviders(): string[] {
  const found: string[] = [];
  for (const tool of KNOWN_AI_TOOLS) {
    if (providerRegistry.has(tool.id)) continue;
    if (!toolExistsOnPath(tool.command)) continue;
    providerRegistry.set(tool.id, createProviderForTool(tool));
    found.push(tool.id);
  }
  return found;
}

export function getProcessPeerProvider(providerId: string): ProcessPeerProvider | undefined {
  if (providerRegistry.size === 0) discoverProcessPeerProviders();
  return providerRegistry.get(providerId);
}

export function getProcessPeerProviderIds(): string[] {
  if (providerRegistry.size === 0) discoverProcessPeerProviders();
  return [...providerRegistry.keys()];
}

const PTY_OUTPUT_MAX_LINES = 16;
const PTY_OUTPUT_MAX_BYTES = 6000;
const ANSI_ESCAPE = '\u001B';
const OSC8_START = '\u001B]8;;';
const OSC8_END = '\u0007';

export function tailPtyOutput(text: string, maxLines = PTY_OUTPUT_MAX_LINES, maxBytes = PTY_OUTPUT_MAX_BYTES): string {
  const clean = sanitizeTerminalOutput(text).replace(/^\n+/, '').replace(/\n+$/, '');
  if (!clean) return '';

  const tail = clean.split('\n').slice(-maxLines).join('\n');
  return trimAnsiText(tail, maxBytes);
}

function sanitizeTerminalOutput(text: string): string {
  let output = '';

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === ANSI_ESCAPE) {
      const sequence = readSupportedAnsiSequence(text, index);
      if (sequence) {
        output += sequence;
        index += sequence.length - 1;
        continue;
      }

      const sequenceEnd = readAnsiSequenceEnd(text, index);
      if (sequenceEnd !== undefined) {
        index = sequenceEnd - 1;
      }
      continue;
    }

    if (char === '\r') {
      output += '\n';
      continue;
    }

    if (char === '\b') {
      continue;
    }

    if (char === '\n' || char === '\t') {
      output += char;
      continue;
    }

    if (char >= ' ') {
      output += char;
    }
  }

  return output;
}

function readSupportedAnsiSequence(text: string, start: number): string | undefined {
  if (text.startsWith(OSC8_START, start)) {
    const end = text.indexOf(OSC8_END, start + OSC8_START.length);
    return end === -1 ? undefined : text.slice(start, end + OSC8_END.length);
  }

  if (!text.startsWith(`${ANSI_ESCAPE}[`, start)) return undefined;

  const end = text.indexOf('m', start + 2);
  if (end === -1) return undefined;

  const body = text.slice(start + 2, end);
  return /^[0-9;:?]*$/.test(body) ? text.slice(start, end + 1) : undefined;
}

function readAnsiSequenceEnd(text: string, start: number): number | undefined {
  if (text.startsWith(`${ANSI_ESCAPE}[`, start)) {
    for (let index = start + 2; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      if (code >= 0x40 && code <= 0x7e) return index + 1;
    }
    return undefined;
  }

  if (text.startsWith(`${ANSI_ESCAPE}]`, start)) {
    const belEnd = text.indexOf(OSC8_END, start + 2);
    const stEnd = text.indexOf(`${ANSI_ESCAPE}\\`, start + 2);
    const ends = [belEnd, stEnd].filter(end => end !== -1).sort((a, b) => a - b);
    return ends[0] === undefined ? undefined : ends[0] + (stEnd === ends[0] ? 2 : 1);
  }

  return undefined;
}

function trimAnsiText(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text) <= maxBytes) return text;

  let output = '';
  let bytes = 0;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === ANSI_ESCAPE) {
      const sequence = readSupportedAnsiSequence(text, index);
      if (sequence) {
        const nextBytes = Buffer.byteLength(sequence);
        if (bytes + nextBytes <= maxBytes) {
          output += sequence;
          bytes += nextBytes;
        }
        index += sequence.length - 1;
        continue;
      }

      const sequenceEnd = readAnsiSequenceEnd(text, index);
      if (sequenceEnd !== undefined) {
        index = sequenceEnd - 1;
      }
      continue;
    }

    const next = String.fromCodePoint(text.codePointAt(index) ?? char.codePointAt(0) ?? 0);
    const nextBytes = Buffer.byteLength(next);
    if (bytes + nextBytes > maxBytes) break;

    output += next;
    bytes += nextBytes;
    index += next.length - 1;
  }

  return `${output}\u2026`;
}

function formatCommandForDisplay(command: string, args: string[]): string {
  return [command, ...args].map(quoteCommandArg).join(' ');
}

function quoteCommandArg(arg: string): string {
  if (/^[^\s"'\\]+$/.test(arg)) return arg;
  return JSON.stringify(arg);
}

function stripAnsi(text: string): string {
  // biome-ignore lint/complexity/useRegexLiterals: regex literal with ESC trips noControlCharactersInRegex.
  return text.replace(new RegExp('(?:\\u001B)(?:[@-Z\\\\-_]|\\[[0-?]*[ -/]*[@-~])', 'g'), '');
}
