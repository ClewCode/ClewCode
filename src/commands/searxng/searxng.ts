import { execSync } from 'child_process';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import type { LocalCommandCall } from '../../types/command.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMPOSE_DIR = resolve(__dirname, '..', '..', '..', 'searxng');
const COMPOSE_FILE = resolve(COMPOSE_DIR, 'docker-compose.yml');

function compose(args: string): string {
  try {
    return execSync(`docker compose -f "${COMPOSE_FILE}" ${args}`, {
      cwd: COMPOSE_DIR,
      encoding: 'utf-8',
      timeout: 30_000,
      stdio: 'pipe',
    }).trim();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`SearXNG: ${msg}`);
  }
}

function getStatus(): string {
  try {
    // docker compose ps -q returns container ID if running, empty if not
    // Avoids --format Go template quoting issues on Windows cmd.exe
    const id = compose('ps -q');
    if (id) return 'SearXNG is running.';
  } catch {
    // docker command failed
  }
  return 'SearXNG is stopped.';
}

export const call: LocalCommandCall = async args => {
  const arg = args?.trim().toLowerCase();

  switch (arg) {
    case 'on':
    case 'start':
    case 'up': {
      if (!getStatus().startsWith('SearXNG is stopped')) {
        return { type: 'text', value: 'SearXNG is already running.' };
      }
      compose('up -d');
      await new Promise(r => setTimeout(r, 3000));
      return { type: 'text', value: getStatus() };
    }

    case 'off':
    case 'stop':
    case 'down': {
      if (getStatus().startsWith('SearXNG is stopped')) {
        return { type: 'text', value: 'SearXNG is already stopped.' };
      }
      compose('down');
      return { type: 'text', value: 'SearXNG stopped.' };
    }

    case 'restart': {
      compose('restart');
      await new Promise(r => setTimeout(r, 3000));
      return { type: 'text', value: getStatus() };
    }
    default: {
      return { type: 'text', value: getStatus() };
    }
  }
};
