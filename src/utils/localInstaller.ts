import { access } from 'fs/promises';
import { join } from 'path';
import { getClewConfigHomeDir } from './envUtils.js';

function getLocalInstallDir(): string {
  return join(getClewConfigHomeDir(), 'local');
}

export function getLocalClaudePath(): string {
  return join(getLocalInstallDir(), 'claude');
}

export function isRunningFromLocalInstallation(): boolean {
  const execPath = process.argv[1] || '';
  return execPath.includes('/.clew/local/node_modules/');
}

export async function localInstallationExists(): Promise<boolean> {
  try {
    await access(join(getLocalInstallDir(), 'node_modules', '.bin', 'claude'));
    return true;
  } catch {
    return false;
  }
}

export function getShellType(): string {
  const shellPath = process.env.SHELL || '';
  if (shellPath.includes('zsh')) return 'zsh';
  if (shellPath.includes('bash')) return 'bash';
  if (shellPath.includes('fish')) return 'fish';
  return 'unknown';
}
