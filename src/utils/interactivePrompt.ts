import * as pty from 'node-pty';

export type InteractivePromptHandler = {
  write: (input: string) => void;
  kill: () => void;
  onData: (callback: (data: string) => void) => void;
  onExit: (callback: (exitCode: number) => void) => void;
};

export type SpawnOptions = {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
};

const PROMPT_PATTERNS = [
  { pattern: /^\s*[Yy]es?[Nn]o?\s*[?):]/, answer: 'y' },
  { pattern: /^\s*\[Yy]\/\[Nn\]/, answer: 'y' },
  { pattern: /^\s*\(Y\/N\)/, answer: 'y' },
  { pattern: /Continue\?/, answer: 'y' },
  { pattern: /Sure\?/, answer: 'y' },
  { pattern: /OK\?/, answer: 'y' },
  { pattern: /Remove directory\?/, answer: 'y' },
  { pattern: /Delete \?/, answer: 'y' },
  { pattern: /Overwrite\?/, answer: 'y' },
  { pattern: /Confirm\?/, answer: 'y' },
  { pattern: /\(y\/n\)/i, answer: 'y' },
  { pattern: /\(yes\/no\)/i, answer: 'yes' },
  { pattern: /\[y\/n\]:?\s*$/im, answer: 'y' },
  { pattern: /password:/i, answer: '' },
  { pattern: /Password:/i, answer: '' },
  { pattern: /passphrase:/i, answer: '' },
  { pattern: /Passphrase:/i, answer: '' },
  { pattern: /username:/i, answer: '' },
  { pattern: /Username:/i, answer: '' },
  { pattern: /Select.*:/, answer: '' },
  { pattern: /Choose.*:/, answer: '' },
  { pattern: /Press.*Enter/, answer: '\r' },
  { pattern: /Press.*return/, answer: '\r' },
];

const PASSWORD_PATTERNS = [/password:/i, /Password:/i, /passphrase:/i, /Passphrase:/i];

function isPasswordPrompt(data: string): boolean {
  return PASSWORD_PATTERNS.some(pattern => pattern.test(data));
}

function detectAndAnswer(data: string): string | null {
  for (const { pattern, answer } of PROMPT_PATTERNS) {
    if (pattern.test(data)) {
      if (answer === '') {
        return null;
      }
      return answer;
    }
  }
  return null;
}

export async function spawnInteractiveCommand(
  options: SpawnOptions,
  onPromptDetected?: (prompt: string) => Promise<string>,
): Promise<InteractivePromptHandler> {
  const {
    command,
    args = [],
    cwd = process.cwd(),
    env = process.env as Record<string, string>,
    cols = 80,
    rows = 24,
  } = options;

  return new Promise((resolve, _reject) => {
    let _dataBuffer = '';
    let resolved = false;

    const shell = pty.spawn(command, args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: { ...env, TERM: 'xterm-256color' },
      handleFlowControl: true,
    });

    const handlers = {
      write: (input: string) => {
        shell.write(input);
      },

      kill: () => {
        shell.kill();
      },

      onData: (callback: (data: string) => void) => {
        shell.onData(data => {
          _dataBuffer += data;
          callback(data);
        });
      },

      onExit: (callback: (exitCode: number) => void) => {
        shell.onExit(({ exitCode }) => {
          if (!resolved) {
            resolved = true;
            callback(exitCode);
          }
        });
      },
    };

    shell.onData(data => {
      _dataBuffer += data;

      if (isPasswordPrompt(data)) {
        return;
      }

      const answer = detectAndAnswer(data);
      if (answer !== null && onPromptDetected) {
        onPromptDetected(data).then(userAnswer => {
          if (userAnswer) {
            shell.write(`${userAnswer}\r`);
          }
        });
      } else if (answer !== null) {
        shell.write(`${answer}\r`);
      }
    });

    shell.onExit(({ exitCode }) => {
      if (!resolved) {
        resolved = true;
        resolve(handlers);
      }
    });

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(handlers);
      }
    }, 100);
  });
}

export async function runInteractiveCommand(
  command: string,
  args: string[] = [],
  options: {
    cwd?: string;
    env?: Record<string, string>;
    autoAnswer?: boolean;
    onPromptDetected?: (prompt: string) => Promise<string>;
  } = {},
): Promise<{ output: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    let output = '';

    const shell = pty.spawn(command, args, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: options.cwd || process.cwd(),
      env: { ...(options.env || process.env), TERM: 'xterm-256color' },
      handleFlowControl: true,
    });

    shell.onData(data => {
      output += data;

      if (options.autoAnswer !== false) {
        const answer = detectAndAnswer(data);
        if (answer !== null) {
          shell.write(`${answer}\r`);
        }
      }
    });

    shell.onExit(({ exitCode }) => {
      resolve({ output, exitCode });
    });

    setTimeout(() => {
      shell.kill();
      reject(new Error('Process timed out'));
    }, 30000);
  });
}

export function isInteractivePrompt(text: string): boolean {
  return PROMPT_PATTERNS.some(({ pattern }) => pattern.test(text));
}

export function suggestAnswer(prompt: string): string | null {
  for (const { pattern, answer } of PROMPT_PATTERNS) {
    if (pattern.test(prompt)) {
      return answer;
    }
  }
  return null;
}
