import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import * as realChildProcess from 'node:child_process';

// PeerSpawnTool.call() opens a real terminal window and writes real temp files.
// Without this mock the suite spawns terminals on the developer's desktop, and
// asserts on whether the host happens to have an emulator installed — which is
// why it passed on Windows and failed on Linux/macOS CI.
type SpawnCall = { command: string; args: string[]; options: Record<string, unknown> };
const spawnCalls: SpawnCall[] = [];
let spawnBehavior: 'ok' | 'error' = 'ok';

function fakeChild() {
  const child: Record<string, unknown> = {
    pid: 4242,
    unref: () => child,
    on: (event: string, handler: (err: Error) => void) => {
      if (event === 'error' && spawnBehavior === 'error') {
        // Emulate node's async 'error' emission for a missing executable.
        queueMicrotask(() => handler(new Error('spawn ENOENT')));
      }
      return child;
    },
  };
  return child;
}

// Spread the real module: mock.module replaces the whole module, and other
// code in the suite imports execSync/exec from here.
mock.module('node:child_process', () => ({
  ...realChildProcess,
  spawn: (command: string, args: string[], options: Record<string, unknown>) => {
    spawnCalls.push({ command, args, options });
    return fakeChild();
  },
}));

const { PeerSpawnTool } = await import('./PeerSpawnTool.js');

beforeEach(() => {
  spawnCalls.length = 0;
  spawnBehavior = 'ok';
});

afterEach(() => {
  spawnBehavior = 'ok';
});

describe('PeerSpawnTool', () => {
  test('spawns a terminal without reporting port or joined status', async () => {
    const result = await PeerSpawnTool.call({});

    expect(result.data.success).toBe(true);
    expect(spawnCalls.length).toBeGreaterThan(0);
    // Both fields were hardcoded and never updated, so they lied; they must stay gone.
    expect('port' in result.data).toBe(false);
    expect('joined' in result.data).toBe(false);
  });

  test('does not leak sensitive env vars from parent to peer', async () => {
    const original = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'secret-key-12345';

    try {
      const result = await PeerSpawnTool.call({});
      expect(result.data.success).toBe(true);

      const env = spawnCalls[0]?.options.env as Record<string, string> | undefined;
      expect(env).toBeDefined();
      expect(env).not.toHaveProperty('OPENAI_API_KEY');
      expect(JSON.stringify(spawnCalls)).not.toContain('secret-key-12345');
    } finally {
      if (original === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = original;
      }
    }
  });

  test('detaches the child so the peer outlives this process', async () => {
    await PeerSpawnTool.call({});

    expect(spawnCalls[0]?.options.detached).toBe(true);
    expect(spawnCalls[0]?.options.stdio).toBe('ignore');
  });

  test.skipIf(process.platform !== 'linux')(
    'treats a terminal that stays open as spawned, and opens only one',
    async () => {
      // A launched terminal emits no 'exit'. Requiring one made the loop open a
      // window per emulator and still report "No terminal emulator found".
      const result = await PeerSpawnTool.call({});

      expect(result.data.success).toBe(true);
      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0]?.command).toBe('x-terminal-emulator');
    },
  );

  test.skipIf(process.platform !== 'linux')(
    'falls through every emulator, then reports a meaningful error',
    async () => {
      spawnBehavior = 'error';

      const result = await PeerSpawnTool.call({});

      expect(spawnCalls.map(c => c.command)).toEqual(['x-terminal-emulator', 'gnome-terminal', 'xterm']);
      expect(result.data.success).toBe(false);
      expect(result.data.error).toBeTruthy();
      expect(result.data.error).not.toContain('undefined');
    },
  );
});
