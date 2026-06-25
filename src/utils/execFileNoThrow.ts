// This file represents useful wrappers over node:child_process
// These wrappers ease error handling and cross-platform compatbility
// By using execa, Windows automatically gets shell escaping + BAT / CMD handling

import spawn, { type SubprocessError } from 'nano-spawn';
import { getCwd } from '../utils/cwd.js';

export { execSyncWithDefaults_DEPRECATED } from './execFileNoThrowPortable.js';

const MS_IN_SECOND = 1000;
const SECONDS_IN_MINUTE = 60;

type ExecFileOptions = {
  abortSignal?: AbortSignal;
  timeout?: number;
  preserveOutputOnError?: boolean;
  // Setting useCwd=false avoids circular dependencies during initialization
  // getCwd() -> PersistentShell -> logEvent() -> execFileNoThrow
  useCwd?: boolean;
  env?: NodeJS.ProcessEnv;
  stdin?: 'ignore' | 'inherit' | 'pipe';
  input?: string;
};

export function execFileNoThrow(
  file: string,
  args: string[],
  options: ExecFileOptions = {
    timeout: 10 * SECONDS_IN_MINUTE * MS_IN_SECOND,
    preserveOutputOnError: true,
    useCwd: true,
  },
): Promise<{ stdout: string; stderr: string; code: number; error?: string }> {
  return execFileNoThrowWithCwd(file, args, {
    abortSignal: options.abortSignal,
    timeout: options.timeout,
    preserveOutputOnError: options.preserveOutputOnError,
    cwd: options.useCwd ? getCwd() : undefined,
    env: options.env,
    stdin: options.stdin,
    input: options.input,
  });
}

type ExecFileWithCwdOptions = {
  abortSignal?: AbortSignal;
  timeout?: number;
  preserveOutputOnError?: boolean;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  shell?: boolean | string | undefined;
  stdin?: 'ignore' | 'inherit' | 'pipe';
  input?: string;
};

type SubprocessErrorInfo = {
  message: string;
  signalName?: string;
};

/**
 * Extracts a human-readable error message from an execa result.
 *
 * Priority order:
 * 1. shortMessage - execa's human-readable error (e.g., "Command failed with exit code 1: ...")
 *    This is preferred because it already includes signal info when a process is killed,
 *    making it more informative than just the signal name.
 * 2. signal - the signal that killed the process (e.g., "SIGTERM")
 * 3. errorCode - fallback to just the numeric exit code
 */
function getErrorMessage(result: SubprocessErrorInfo, errorCode: number): string {
  if (result.message) {
    return result.message;
  }
  if (typeof result.signalName === 'string') {
    return result.signalName;
  }
  return String(errorCode);
}

/**
 * execFile, but always resolves (never throws)
 */
export function execFileNoThrowWithCwd(
  file: string,
  args: string[],
  {
    abortSignal,
    timeout: finalTimeout = 10 * SECONDS_IN_MINUTE * MS_IN_SECOND,
    preserveOutputOnError: finalPreserveOutput = true,
    cwd: finalCwd,
    env: finalEnv,
    shell,
    stdin: finalStdin,
    input: finalInput,
  }: ExecFileWithCwdOptions = {
    timeout: 10 * SECONDS_IN_MINUTE * MS_IN_SECOND,
    preserveOutputOnError: true,
  },
): Promise<{ stdout: string; stderr: string; code: number; error?: string }> {
  return new Promise(resolve => {
    spawn(file, args, {
      signal: abortSignal,
      timeout: finalTimeout,
      cwd: finalCwd,
      env: finalEnv,
      shell,
      stdin: finalInput ? ({ string: finalInput } as any) : finalStdin,
    })
      .then(result => {
        void resolve({
          stdout: result.stdout,
          stderr: result.stderr,
          code: 0,
        });
      })
      .catch((error: SubprocessError) => {
        if (finalPreserveOutput) {
          const errorCode = error.exitCode ?? 1;
          void resolve({
            stdout: error.stdout || '',
            stderr: error.stderr || '',
            code: errorCode,
            error: getErrorMessage(error, errorCode),
          });
        } else {
          void resolve({ stdout: '', stderr: '', code: error.exitCode ?? 1 });
        }
      });
  });
}
