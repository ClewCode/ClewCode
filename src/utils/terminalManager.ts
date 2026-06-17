import { type ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { EventEmitter } from 'events';

export type SessionOptions = {
  shell?: string;
  cwd?: string;
  cols?: number;
  rows?: number;
  env?: Record<string, string>;
};

export type ExecOptions = {
  command: string;
  timeout?: number;
  maxLines?: number;
  cwd?: string;
};

export type ExecResult = {
  output: string;
  exitCode: number;
  cwd: string;
  timedOut: boolean;
};

const COMPLETION_MARKER = '__TERMINAL_COMPLETE__';
const _COMPLETION_REGEX = /__TERMINAL_COMPLETE__:(\d+):([^:]+):/;

function generateMarker(exitCode: number, cwd: string): string {
  return `${COMPLETION_MARKER}${exitCode}:${cwd}:${Date.now()}`;
}

export class InteractiveSession extends EventEmitter {
  id: string;
  process: ChildProcessWithoutNullStreams | null = null;
  cwd: string;
  shell: string;
  buffer: string = '';

  constructor(id: string, options: SessionOptions = {}) {
    super();
    this.id = id;
    this.cwd = options.cwd || process.cwd();
    this.shell = options.shell || (process.platform === 'win32' ? 'cmd.exe' : 'bash');
  }

  start(): void {
    const shellArgs =
      process.platform === 'win32' ? ['/c', 'echo Starting session...'] : ['-c', 'echo Starting session...'];

    this.process = spawn(this.shell, shellArgs, {
      cwd: this.cwd,
      env: process.env as Record<string, string>,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.process.stdout?.on('data', data => this.handleData(data.toString()));
    this.process.stderr?.on('data', data => this.handleData(data.toString()));
    this.process.on('exit', code => this.emit('exit', code));
  }

  write(data: string): void {
    if (this.process?.stdin) {
      this.process.stdin.write(data);
    }
  }

  writeln(data: string): void {
    this.write(`${data}\n`);
  }

  private handleData(data: string): void {
    this.buffer += data;
    this.emit('data', data);
  }

  kill(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  getBuffer(): string {
    return this.buffer;
  }

  clearBuffer(): void {
    this.buffer = '';
  }
}

class TerminalManager {
  private sessions = new Map<string, InteractiveSession>();
  private sessionCounter = 0;

  async startSession(options: SessionOptions = {}): Promise<string> {
    const id = `session_${++this.sessionCounter}`;
    const session = new InteractiveSession(id, options);
    session.start();
    this.sessions.set(id, session);

    await this.delay(500);
    return id;
  }

  async exec(options: ExecOptions): Promise<ExecResult> {
    const { command, timeout = 30000, maxLines = 200, cwd = process.cwd() } = options;

    const wrappedCommand =
      process.platform === 'win32'
        ? `(${command}) && echo ${generateMarker(0, cwd)}`
        : `${command} && echo '${generateMarker(0, cwd)}'`;

    return new Promise((resolve, reject) => {
      const child = spawn(
        process.platform === 'win32' ? 'cmd.exe' : '/bin/bash',
        process.platform === 'win32' ? ['/c', wrappedCommand] : ['-c', wrappedCommand],
        { cwd, stdio: ['pipe', 'pipe', 'pipe'] },
      );

      let output = '';
      let timedOut = false;
      let exitCode = 0;
      const finalCwd = cwd;

      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, timeout);

      child.stdout?.on('data', data => {
        output += data.toString();
      });

      child.stderr?.on('data', data => {
        output += data.toString();
      });

      child.on('close', code => {
        clearTimeout(timeoutHandle);
        exitCode = code || 0;

        const lines = output.split('\n');
        const outputLines = lines.slice(0, maxLines);
        const trimmedOutput = outputLines.join('\n');

        resolve({
          output: trimmedOutput,
          exitCode,
          cwd: finalCwd,
          timedOut,
        });
      });

      child.on('error', err => {
        clearTimeout(timeoutHandle);
        reject(err);
      });
    });
  }

  async wait(sessionId: string, pattern: string, timeout = 30000): Promise<{ matched: boolean; output: string }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    return new Promise((resolve, _reject) => {
      let matched = false;
      let matchedOutput = '';
      let timer: NodeJS.Timeout;

      const onData = (data: string) => {
        matchedOutput += data;
        const regex = new RegExp(pattern);
        if (regex.test(matchedOutput)) {
          matched = true;
          clearTimeout(timer);
          session.removeListener('data', onData);
          resolve({ matched, output: matchedOutput });
        }
      };

      timer = setTimeout(() => {
        session.removeListener('data', onData);
        resolve({ matched: false, output: matchedOutput });
      }, timeout);

      session.on('data', onData);
    });
  }

  write(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    session?.write(data);
  }

  stopSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.kill();
      this.sessions.delete(sessionId);
    }
  }

  listSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

const terminalManager = new TerminalManager();

export async function startTerminal(options?: SessionOptions): Promise<string> {
  return terminalManager.startSession(options);
}

export async function execTerminal(options: ExecOptions): Promise<ExecResult> {
  return terminalManager.exec(options);
}

export async function waitTerminal(
  sessionId: string,
  pattern: string,
  timeout?: number,
): Promise<{ matched: boolean; output: string }> {
  return terminalManager.wait(sessionId, pattern, timeout);
}

export function writeTerminal(sessionId: string, data: string): void {
  terminalManager.write(sessionId, data);
}

export function stopTerminal(sessionId: string): void {
  terminalManager.stopSession(sessionId);
}

export function listTerminals(): string[] {
  return terminalManager.listSessions();
}

export default TerminalManager;
