import { type SpawnOptionsWithoutStdio, spawn } from 'child_process';
import * as pty from 'node-pty';

export type ProcessPeerTask = {
  prompt: string;
  cwd?: string;
  model?: string;
  timeoutMs?: number;
  mode?: ProcessPeerMode;
  onProgress?: (progress: ProcessPeerProgressEvent) => void;
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
  status: 'starting' | 'running' | 'complete';
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
};

export type ProcessMeshProviderConfig = {
  id: string;
  label: string;
  command: string;
  defaultTimeoutMs?: number;
  maxOutputBytes?: number;
  buildArgs: (task: ProcessPeerTask) => string[];
  buildPtyArgs?: (task: ProcessPeerTask) => string[];
  buildStdin?: (task: ProcessPeerTask) => string | undefined;
};

export class ProcessMeshProvider {
  readonly id: string;
  readonly label: string;
  private readonly command: string;
  private readonly defaultTimeoutMs: number;
  private readonly maxOutputBytes: number;
  private readonly buildArgs: (task: ProcessPeerTask) => string[];
  private readonly buildPtyArgs: ((task: ProcessPeerTask) => string[]) | undefined;
  private readonly buildStdin: ((task: ProcessPeerTask) => string | undefined) | undefined;

  constructor(config: ProcessMeshProviderConfig) {
    this.id = config.id;
    this.label = config.label;
    this.command = config.command;
    this.defaultTimeoutMs = config.defaultTimeoutMs ?? 10 * 60_000;
    this.maxOutputBytes = config.maxOutputBytes ?? 1024 * 1024;
    this.buildArgs = config.buildArgs;
    this.buildPtyArgs = config.buildPtyArgs;
    this.buildStdin = config.buildStdin;
  }

  async runTask(task: ProcessPeerTask): Promise<ProcessPeerResult> {
    const prompt = task.prompt.trim();
    if (!prompt) {
      throw new Error(`${this.label} peer task is empty`);
    }

    const startedAt = Date.now();
    const cwd = task.cwd ?? process.cwd();
    const mode = task.mode ?? 'exec';
    const args =
      mode === 'pty' && this.buildPtyArgs
        ? this.buildPtyArgs({ ...task, prompt })
        : this.buildArgs({ ...task, prompt });
    const timeoutMs = task.timeoutMs ?? this.defaultTimeoutMs;
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
      const stdin = this.buildStdin?.({ ...task, prompt });
      if (stdin !== undefined) {
        child.stdin?.end(stdin);
      }

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
      }, timeoutMs);

      const appendOutput = (current: string, currentBytes: number, chunk: Buffer): [string, number] => {
        if (currentBytes >= this.maxOutputBytes) return [current, currentBytes];
        const availableBytes = this.maxOutputBytes - currentBytes;
        const nextChunk = chunk.byteLength > availableBytes ? chunk.subarray(0, availableBytes) : chunk;
        return [current + nextChunk.toString('utf8'), currentBytes + nextChunk.byteLength];
      };

      child.stdout?.on('data', chunk => {
        [stdout, stdoutBytes] = appendOutput(stdout, stdoutBytes, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        task.onProgress?.({
          providerId: this.id,
          mode,
          command: this.command,
          displayCommand: formatCommandForDisplay(this.command, args),
          args,
          cwd,
          elapsedMs: Date.now() - startedAt,
          outputTail: tailPtyOutput(stdout),
          status: 'running',
        });
      });

      child.stderr?.on('data', chunk => {
        [stderr, stderrBytes] = appendOutput(stderr, stderrBytes, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        task.onProgress?.({
          providerId: this.id,
          mode,
          command: this.command,
          displayCommand: formatCommandForDisplay(this.command, args),
          args,
          cwd,
          elapsedMs: Date.now() - startedAt,
          outputTail: tailPtyOutput(stderr),
          status: 'running',
        });
      });

      child.on('error', err => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      });

      child.on('close', (exitCode, signal) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          providerId: this.id,
          mode,
          command: this.command,
          args,
          cwd,
          stdout,
          stderr,
          exitCode,
          signal,
          timedOut,
          durationMs: Date.now() - startedAt,
        });
        task.onProgress?.({
          providerId: this.id,
          mode,
          command: this.command,
          displayCommand: formatCommandForDisplay(this.command, args),
          args,
          cwd,
          elapsedMs: Date.now() - startedAt,
          outputTail: tailPtyOutput(stdout || stderr),
          status: 'complete',
        });
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
          outputTail: tailPtyOutput(stdout),
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

      const stdin = this.buildStdin?.({ prompt, cwd, timeoutMs, args, startedAt });
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
        const durationMs = Date.now() - startedAt;
        emitProgress('complete');
        resolve({
          providerId: this.id,
          mode: 'pty',
          command: this.command,
          args,
          cwd,
          stdout: stripAnsi(stdout),
          stderr: '',
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
  const args = ['exec', '-C', task.cwd ?? process.cwd(), '--color', 'never'];
  if (task.model) {
    args.push('-m', task.model);
  }
  args.push('-');
  return args;
}

export function buildCodexPtyArgs(task: ProcessPeerTask): string[] {
  const args = ['exec', '-C', task.cwd ?? process.cwd(), '--color', 'never'];
  if (task.model) {
    args.push('-m', task.model);
  }
  args.push(task.prompt);
  return args;
}

function shouldUseShellForCommand(command: string): boolean {
  if (process.platform !== 'win32') return false;
  return !/\.(exe|com)$/i.test(command);
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

export function createCodexExecPeerProvider(command = process.env.CLEW_CODEX_COMMAND || 'codex'): ProcessMeshProvider {
  return new ProcessMeshProvider({
    id: 'codex',
    label: 'Codex',
    command,
    buildArgs: buildCodexExecArgs,
    buildPtyArgs: buildCodexPtyArgs,
    buildStdin: task => (task.mode === 'pty' ? undefined : task.prompt),
  });
}

export function getProcessMeshProvider(providerId: string): ProcessMeshProvider | undefined {
  if (providerId === 'codex') {
    return createCodexExecPeerProvider();
  }
  return undefined;
}

export function getProcessMeshProviderIds(): string[] {
  return ['codex'];
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
