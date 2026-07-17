/**
 * /peer — Peer discovery and task assignment
 *
 * A "lead peer" discovers "worker peers" on the LAN and assigns them tasks.
 *
 * Usage:
 *   /peer share              Become a worker (advertise on LAN + file)
 *   /peer share stop         Stop advertising
 *   /peer                    Open interactive peer list
 *   /peer discover           Scan for workers (non-interactive)
 *   /peer todo <peer> <task> Assign a task to a worker
 *   /peer todos              Show received tasks
 *   /peer todo done <id>     Mark task complete
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import ansis from 'ansis';
import { spawn as childSpawn } from 'child_process';
import { getProjectRoot } from '../../bootstrap/state.js';
import { getGlobalDiscovery } from '../../peer/PeerDiscovery.js';
import { getGlobalPeerServer } from '../../peer/PeerServer.js';
import { getGlobalPeerStore } from '../../peer/PeerStore.js';
import { formatPeerTaskDashboard, formatPeerTaskSummary } from '../../peer/peerDashboard.js';
import type { PeerInfo } from '../../peer/types.js';
import { notifyPeerFeedback } from '../../tools/peer/peerFeedback.js';
import { errorMessage } from '../../utils/errors.js';
import { formatPeerList } from './PeerList.js';
import PeerMenu from './PeerMenu.js';
import { type SwarmPeerResult, SwarmResult } from './swarmResult.js';

let myPeerId = '';

function sharingStatus(): boolean {
  try {
    return getGlobalDiscovery().isSharing;
  } catch {
    return false;
  }
}

function getMyName(): string {
  return getGlobalDiscovery().hostname || 'unknown';
}

function parseArgs(args: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < args.length; i++) {
    const char = args[i]!;
    if (char === '"' || char === "'") {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ' ' && !inQuotes) {
      if (current.trim().length > 0) result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim().length > 0) result.push(current.trim());
  return result;
}

function getFlagValue(tokens: string[], flag: string): string | undefined {
  const idx = tokens.indexOf(flag);
  if (idx >= 0 && idx + 1 < tokens.length) return tokens[idx + 1];
  return undefined;
}

function spawnPeerTerminal(options: { name?: string; prompt?: string; model?: string; agent?: string }): void {
  const mainScript = process.argv[1]!;
  const args = [
    ...(process.argv[1].endsWith('.tsx') || process.argv[1].endsWith('.ts') ? ['run', mainScript] : [mainScript]),
  ];
  if (options.name) {
    args.push('--peer-name', options.name);
  }
  if (options.prompt) {
    args.push('--system-prompt', options.prompt);
  }
  if (options.model) {
    args.push('--model', options.model);
  }
  if (options.agent) {
    args.push('--agent', options.agent);
  }
  args.push('--peer-share');

  const execPath = process.execPath;
  const fullCommand = `"${execPath}" ${args.map(a => `"${a.replace(/"/g, '\\"')}"`).join(' ')}`;

  const platform = process.platform;
  // Detached children MUST attach an 'error' listener and be unref'd. An
  // unhandled async 'error' event (e.g. EMFILE/EAGAIN when spawning many
  // peers at once) is otherwise re-thrown as an uncaughtException and kills
  // this parent process mid-swarm — leaving the terminal in mouse/focus
  // tracking mode because cleanup can't run in time. unref() keeps a
  // successful detached child from pinning the parent's event loop.
  const onSpawnError = (err: Error): void => {
    notifyPeerFeedback(`failed to open peer terminal: ${errorMessage(err)}`, 'peer-spawn', 'high');
  };
  if (platform === 'win32') {
    const child = childSpawn('cmd.exe', ['/c', 'start', 'cmd.exe', '/k', fullCommand], {
      detached: true,
      stdio: 'ignore',
      shell: true,
    });
    child.on('error', onSpawnError);
    child.unref();
  } else if (platform === 'darwin') {
    const appleScript = `tell application "Terminal" to do script "${fullCommand.replace(/"/g, '\\"')}"`;
    const child = childSpawn('osascript', ['-e', appleScript], {
      detached: true,
      stdio: 'ignore',
    });
    child.on('error', onSpawnError);
    child.unref();
  } else {
    const child = childSpawn('x-terminal-emulator', ['-e', fullCommand], {
      detached: true,
      stdio: 'ignore',
    });
    child.on('error', () => {
      const fallback = childSpawn('gnome-terminal', ['--', 'sh', '-c', `${fullCommand}; exec sh`], {
        detached: true,
        stdio: 'ignore',
      });
      fallback.on('error', onSpawnError);
      fallback.unref();
    });
    child.unref();
  }
}

async function startSharing(onDone: (msg: string) => void): Promise<void> {
  if (sharingStatus()) {
    onDone(ansis.dim('Already sharing. Run /peer share stop to stop.'));
    return;
  }

  try {
    const discovery = getGlobalDiscovery();
    const server = getGlobalPeerServer();
    myPeerId = discovery.peerId;

    // Sync display name + role to peer server for remote peers to see
    const tags = getGlobalPeerStore().getPeerTags(discovery.peerId);
    if (tags?.displayName) server.extraInfo.displayName = tags.displayName;
    if (tags?.role) server.extraInfo.role = tags.role;

    // Always set callbacks (overwrites main.tsx defaults to include enqueue and onExec)
    server.setCallbacks({
      onTodo: todo => {
        getGlobalPeerStore().addTodo(todo);
        import('../../utils/messageQueueManager.js').then(({ enqueue }) => {
          enqueue({ value: `Task from ${todo.fromName}: ${todo.message}`, mode: 'prompt', priority: 'next' });
        });
        // Also inject the dashboard so AI sees full context
        import('../../peer/peerDashboard.js').then(({ formatPeerTaskSummary }) => {
          const summary = formatPeerTaskSummary();
          if (summary) {
            import('../../utils/messageQueueManager.js').then(({ enqueue }) => {
              enqueue({ value: summary, mode: 'prompt', priority: 'later', isMeta: true });
            });
          }
        });
      },
      onMessage: msg => {
        getGlobalPeerStore().addMessage(msg);
        import('../../utils/messageQueueManager.js').then(({ enqueue }) => {
          enqueue({ value: `From ${msg.fromName}: ${msg.text}`, mode: 'prompt', priority: 'next' });
        });
        // Also inject the dashboard so AI sees full context
        import('../../peer/peerDashboard.js').then(({ formatPeerTaskSummary }) => {
          const summary = formatPeerTaskSummary();
          if (summary) {
            import('../../utils/messageQueueManager.js').then(({ enqueue }) => {
              enqueue({ value: summary, mode: 'prompt', priority: 'later', isMeta: true });
            });
          }
        });
      },
      onExec: async (command: string, cwd?: string) => {
        const { executeCommand } = await import('../../tools/PeerRunTool/PeerRunTool.js');
        return executeCommand(command, 60_000, cwd);
      },
    });

    // Start server if needed (idempotent)
    let port: number;
    if (server.port > 0) {
      port = server.port;
    } else {
      const peerInfo: PeerInfo = {
        id: myPeerId,
        hostname: discovery.hostname,
        ip: '127.0.0.1',
        port: 0,
        cwd: process.cwd(),
        version: '',
        lastSeen: Date.now(),
        status: 'online',
      };
      port = await server.start(peerInfo);
    }

    await discovery.startAdvertising(port, process.cwd(), undefined, undefined, server.token);
    onDone(ansis.dim(`Sharing (port ${port}). Others can find you with /peer discover.`));
  } catch (err) {
    onDone(ansis.red(`Failed: ${errorMessage(err)}`));
  }
}

function stopSharing(onDone: (msg: string) => void): void {
  if (!sharingStatus()) {
    onDone(ansis.dim('Not sharing.'));
    return;
  }
  getGlobalDiscovery().stopAdvertising();
  getGlobalPeerServer().stop();
  onDone(ansis.dim('Stopped sharing.'));
}

async function doDiscover(onDone: (msg: string) => void): Promise<void> {
  try {
    const peers = await getGlobalDiscovery().discoverPeers(3000);
    if (peers.length === 0) {
      onDone(ansis.dim('No peers found.'));
      return;
    }
    const lines = ['Available peers:', ''];
    for (const peer of peers) {
      lines.push(`  /peer join ${peer.ip}:${peer.port}`);
    }
    onDone(lines.join('\n'));
  } catch (err) {
    onDone(ansis.red(`Failed: ${errorMessage(err)}`));
  }
}

// ponytail: 2 retries, 1s backoff — covers LAN hiccups, no dependency needed
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  onRetry?: (attempt: number, total: number) => void,
  retries = 2,
  delayMs = 1000,
): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetch(url, options);
    } catch {
      if (attempt > retries) throw new Error(`Unreachable after ${retries + 1} attempts`);
      onRetry?.(attempt + 1, retries + 1);
    }
    await new Promise(r => setTimeout(r, delayMs));
  }
}

async function sendMessage(peerQuery: string, text: string, onDone: (msg: string) => void): Promise<void> {
  try {
    const store = getGlobalPeerStore();
    const peer = store.findPeer(peerQuery);
    if (!peer) {
      onDone(ansis.red(`✗ Peer "${peerQuery}" not found. Run /peer discover first.`));
      return;
    }

    const url = `http://${peer.ip}:${peer.port}/peer-msg`;
    onDone(ansis.dim(`📡 Sending to ${peer.hostname}...`));

    const response = await fetchWithRetry(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: myPeerId || getMyName(), fromName: getMyName(), text }),
      },
      (a, t) => onDone(ansis.yellow(`♻️  Retry ${a}/${t}...`)),
    );

    if (!response.ok) {
      onDone(ansis.red(`✗ ${peer.hostname} replied HTTP ${response.status}`));
      return;
    }

    onDone(ansis.green(`✓ Message sent to ${peer.hostname}`));
  } catch {
    onDone(ansis.red(`✗ Could not reach ${peer?.hostname ?? peerQuery} after several tries`));
  }
}

async function sendTask(peerQuery: string, text: string, onDone: (msg: string) => void): Promise<void> {
  try {
    const store = getGlobalPeerStore();
    const peer = store.findPeer(peerQuery);
    if (!peer) {
      onDone(ansis.red(`✗ Worker "${peerQuery}" not found. Run /peer discover first.`));
      return;
    }

    const url = `http://${peer.ip}:${peer.port}/peer-todo`;
    onDone(ansis.dim(`📡 Sending task to ${peer.hostname}...`));

    const response = await fetchWithRetry(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: myPeerId || getMyName(), fromName: getMyName(), message: text }),
      },
      (a, t) => onDone(ansis.yellow(`♻️  Retry ${a}/${t}...`)),
    );

    if (!response.ok) {
      onDone(ansis.red(`✗ ${peer.hostname} replied HTTP ${response.status}`));
      return;
    }

    onDone(ansis.green(`✓ Task sent to ${peer.hostname}`));
  } catch {
    onDone(ansis.red(`✗ Could not reach ${peer?.hostname ?? peerQuery} after several tries`));
  }
}

function showTodos(onDone: (msg: string) => void): void {
  const todos = getGlobalPeerStore().getTodos();
  if (todos.length === 0) {
    onDone(ansis.dim('No pending tasks.'));
    return;
  }
  const lines = ['Pending tasks:', ''];
  for (const todo of todos) {
    const status =
      todo.status === 'pending'
        ? ansis.yellow('pending')
        : todo.status === 'done'
          ? ansis.green('done')
          : ansis.red('rejected');
    lines.push(`  ${ansis.bold(todo.id.slice(0, 12))}  ${status}  from ${todo.fromName}: ${todo.message}`);
  }
  onDone(lines.join('\n'));
}

function markTodoDone(id: string, onDone: (msg: string) => void): void {
  if (getGlobalPeerStore().updateTodoStatus(id, 'done')) {
    onDone(ansis.dim(`Task ${id} done.`));
  } else {
    onDone(ansis.red(`Task "${id}" not found.`));
  }
}

// ── Swarm execution ────────────────────────────────────────

type SwarmOptions = {
  command: string;
  timeoutMs: number;
  filter?: string;
  dryRun: boolean;
};

async function doSwarm(options: SwarmOptions, onDone: (msg: string, opts?: any) => void): Promise<SwarmPeerResult[]> {
  const store = getGlobalPeerStore();
  const peers = store.getConnections().filter(p => p.status === 'online' && p.port > 0);

  // Apply filter
  let filtered = peers;
  if (options.filter) {
    const f = options.filter.toLowerCase();
    filtered = peers.filter(p => {
      const tags = store.getPeerTags(p.id);
      const name = p.hostname.toLowerCase();
      const role = (tags?.role ?? '').toLowerCase();
      return name.includes(f) || role.includes(f);
    });
  }

  if (filtered.length === 0) {
    const msg =
      peers.length === 0
        ? 'No connected peers. Use /peer discover and /peer join first.'
        : `No peers match filter "${options.filter}".`;
    onDone(msg, { display: 'system' });
    return [];
  }

  // Dry run
  if (options.dryRun) {
    const lines = ['[Dry Run] Target peers:', ''];
    for (const peer of filtered) {
      const tags = store.getPeerTags(peer.id);
      const role = tags?.role ? ` [${tags.role}]` : '';
      lines.push(`  ${peer.hostname}${role} (${peer.ip}:${peer.port})`);
    }
    lines.push('', `Would send: ${options.command}`);
    onDone(lines.join('\n'), { display: 'system' });
    return [];
  }

  const startedAt = performance.now();
  const results: SwarmPeerResult[] = [];

  // Fire requests to all peers in parallel
  const requests = filtered.map(async peer => {
    const peerStartedAt = performance.now();
    try {
      const url = `http://${peer.ip}:${peer.port}/peer-exec`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: options.command,
          from: myPeerId || getMyName(),
          fromName: getMyName(),
          priority: 'normal',
        }),
        signal: AbortSignal.timeout(options.timeoutMs),
      });

      const durationMs = performance.now() - peerStartedAt;
      const data = await response.json();

      if (data.queued) {
        // Peer is busy, task was queued
        results.push({
          peerId: peer.id,
          hostname: peer.hostname,
          status: 'failed',
          durationMs,
          error: `queued (position ${data.queuePosition}) — use /peer todo for queued tasks`,
        });
      } else if (data.result) {
        results.push({
          peerId: peer.id,
          hostname: peer.hostname,
          status: data.result.exitCode === 0 ? 'success' : 'failed',
          durationMs,
          stdout: data.result.stdout,
          stderr: data.result.stderr,
          error: data.result.exitCode !== 0 ? `exit code ${data.result.exitCode}` : undefined,
        });
      } else if (data.running) {
        // Task is still running (shouldn't happen with synchronous exec)
        results.push({
          peerId: peer.id,
          hostname: peer.hostname,
          status: 'failed',
          durationMs,
          error: 'Task still running after response',
        });
      } else {
        results.push({
          peerId: peer.id,
          hostname: peer.hostname,
          status: 'failed',
          durationMs,
          error: data.error || `HTTP ${response.status}`,
        });
      }
    } catch (err: any) {
      const durationMs = performance.now() - peerStartedAt;
      const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
      results.push({
        peerId: peer.id,
        hostname: peer.hostname,
        status: isTimeout ? 'timeout' : 'failed',
        durationMs,
        error: isTimeout ? `timed out after ${options.timeoutMs / 1000}s` : errorMessage(err),
      });
    }
  });

  await Promise.allSettled(requests);
  return results;
}

async function runSwarm(rest: string, onDone: (msg: string, opts?: any) => void): Promise<void> {
  const tokens = parseArgs(rest);
  if (tokens.length === 0) {
    onDone(
      [
        'Usage: /peer swarm [options] <command>',
        '',
        'Send a command to all connected peers in parallel.',
        '',
        'Options:',
        '  -t, --timeout <seconds>  Per-peer timeout (default: 60)',
        '  -f, --filter <pattern>   Only peers whose hostname/role matches',
        '  --dry-run                 List target peers without executing',
        '',
        'Examples:',
        '  /peer swarm clew -p "summarize the latest changes"',
        '  /peer swarm git status',
        '  /peer swarm -f worker npm test',
        '  /peer swarm --dry-run clew -p "hello"',
      ].join('\n'),
      { display: 'system' },
    );
    return;
  }

  // Parse flags
  let timeoutMs = 60_000;
  let filter: string | undefined;
  let dryRun = false;
  const commandTokens = [...tokens];

  const timeoutIdx = commandTokens.indexOf('--timeout');
  if (timeoutIdx !== -1) {
    const val = commandTokens[timeoutIdx + 1];
    if (val) {
      timeoutMs = Math.max(1, parseInt(val, 10) || 60) * 1000;
      commandTokens.splice(timeoutIdx, 2);
    } else {
      commandTokens.splice(timeoutIdx, 1);
    }
  }
  const tIdx = commandTokens.indexOf('-t');
  if (tIdx !== -1) {
    const val = commandTokens[tIdx + 1];
    if (val) {
      timeoutMs = Math.max(1, parseInt(val, 10) || 60) * 1000;
      commandTokens.splice(tIdx, 2);
    } else {
      commandTokens.splice(tIdx, 1);
    }
  }

  const filterIdx = commandTokens.indexOf('--filter');
  if (filterIdx !== -1) {
    filter = commandTokens[filterIdx + 1];
    if (filter) commandTokens.splice(filterIdx, 2);
    else commandTokens.splice(filterIdx, 1);
  }
  const fIdx = commandTokens.indexOf('-f');
  if (fIdx !== -1) {
    filter = commandTokens[fIdx + 1];
    if (filter) commandTokens.splice(fIdx, 2);
    else commandTokens.splice(fIdx, 1);
  }

  const dryIdx = commandTokens.indexOf('--dry-run');
  if (dryIdx !== -1) {
    dryRun = true;
    commandTokens.splice(dryIdx, 1);
  }

  const command = commandTokens.join(' ');
  if (!command) {
    onDone(ansis.yellow('Missing command. Usage: /peer swarm <command>'), { display: 'system' });
    return;
  }

  const store = getGlobalPeerStore();
  const peers = store.getConnections().filter(p => p.status === 'online' && p.port > 0);
  if (peers.length === 0) {
    onDone(ansis.dim('No connected peers. Use /peer discover and /peer join first.'), { display: 'system' });
    return;
  }

  const results = await doSwarm({ command, timeoutMs, filter, dryRun }, onDone);
  if (results.length === 0 || dryRun) return;

  const actualDuration = results.reduce((max, r) => Math.max(max, r.durationMs), 0);

  return React.createElement(SwarmResult, { results, totalDurationMs: actualDuration, command });
}

// ── Memory Sync ────────────────────────────────────────────

async function runMemorySync(onDone: (msg: string) => void): Promise<void> {
  const store = getGlobalPeerStore();
  const peers = store.getPeers().filter(p => p.port && p.ip);

  if (peers.length === 0) {
    onDone(ansis.yellow('No connected peers. Use /peer discover and /peer join first.'));
    return;
  }

  const { importPeerMemories } = await import('../../memory/peerSync.js');

  const startedAt = performance.now();
  let totalImported = 0;
  const results: string[] = [];

  const requests = peers.map(async peer => {
    try {
      const token = store.getPeerToken(peer.id) ?? '';
      const url = `http://${peer.ip}:${peer.port}/peer-memory-export?token=${encodeURIComponent(token)}&limit=50`;
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) {
        results.push(`  ${ansis.red('✗')} ${peer.hostname} — HTTP ${response.status}`);
        return;
      }

      const data = (await response.json()) as { memories?: unknown[] };
      if (!data.memories?.length) {
        results.push(`  ${ansis.dim('−')} ${peer.hostname} — no memories`);
        return;
      }

      const syncResult = await importPeerMemories(data.memories, peer.hostname);
      totalImported += syncResult.imported;
      results.push(
        `  ${ansis.green('✓')} ${peer.hostname} — ${syncResult.imported} imported, ${syncResult.reinforced} reinforced`,
      );
    } catch (err: any) {
      const msg =
        err?.name === 'TimeoutError' || err?.name === 'AbortError' ? 'timed out' : (err?.message ?? String(err));
      results.push(`  ${ansis.red('✗')} ${peer.hostname} — ${msg}`);
    }
  });

  await Promise.allSettled(requests);
  const duration = ((performance.now() - startedAt) / 1000).toFixed(1);

  const lines = [
    ansis.bold(`Memory Sync (${duration}s)`),
    ...results,
    '',
    totalImported > 0
      ? ansis.green(`Imported ${totalImported} memories from ${peers.length} peer(s)`)
      : ansis.dim('No new memories imported'),
  ];
  onDone(lines.join('\n'));
}

// ── Memory Auto-Sync State ─────────────────────────────────

const PEER_MEMORY_STATE_FILE = '.clew/peer-memory-sync.json';

type PeerMemorySyncState = {
  enabled: boolean;
  intervalMin: number;
  cronTaskId?: string;
};

async function readPeerMemoryState(): Promise<PeerMemorySyncState> {
  const path = join(getProjectRoot(), PEER_MEMORY_STATE_FILE);
  if (!existsSync(path)) return { enabled: false, intervalMin: 60 };
  try {
    const raw = await readFile(path, 'utf-8');
    return JSON.parse(raw) as PeerMemorySyncState;
  } catch {
    return { enabled: false, intervalMin: 60 };
  }
}

async function writePeerMemoryState(state: PeerMemorySyncState): Promise<void> {
  const path = join(getProjectRoot(), PEER_MEMORY_STATE_FILE);
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, JSON.stringify(state, null, 2), 'utf-8');
}

async function runMemoryAuto(args: string, onDone: (msg: string) => void): Promise<void> {
  const state = await readPeerMemoryState();

  // /peer memory auto → show status
  if (!args) {
    const status = state.enabled ? ansis.green('ON') : ansis.dim('OFF');
    onDone(
      [
        ansis.bold('Auto Memory Sync'),
        `  Status: ${status}`,
        `  Interval: ${state.intervalMin} min`,
        '',
        '  /peer memory auto on [minutes]    Enable (default 60 min interval)',
        '  /peer memory auto off             Disable',
      ].join('\n'),
    );
    return;
  }

  // /peer memory auto off
  if (args === 'off') {
    if (state.cronTaskId) {
      const { removeCronTasks } = await import('../../utils/cronTasks.js');
      await removeCronTasks([state.cronTaskId]);
    }
    await writePeerMemoryState({ ...state, enabled: false, cronTaskId: undefined });
    onDone(ansis.dim('Auto memory sync disabled.'));
    return;
  }

  // /peer memory auto on [interval]
  if (args === 'on' || args.startsWith('on ')) {
    const intervalMin = parseInt(args.slice(2).trim(), 10) || 60;
    const clampedInterval = Math.max(15, Math.min(1440, intervalMin));
    const cronExpr = `*/${clampedInterval} * * * *`;

    // Cancel existing task if any
    if (state.cronTaskId) {
      const { removeCronTasks } = await import('../../utils/cronTasks.js');
      await removeCronTasks([state.cronTaskId]);
    }

    // Schedule new recurring cron task
    const { addCronTask } = await import('../../utils/cronTasks.js');
    const taskId = await addCronTask(
      cronExpr,
      '/peer memory sync',
      true, // recurring
      true, // durable
    );

    await writePeerMemoryState({
      enabled: true,
      intervalMin: clampedInterval,
      cronTaskId: taskId,
    });

    // Run an initial sync immediately
    onDone(ansis.green(`Auto memory sync enabled (every ${clampedInterval} min). Syncing now...`), {
      display: 'system',
    });
    await runMemorySync(msg => onDone(msg, { display: 'system' }));
    return;
  }

  onDone(ansis.yellow('Usage: /peer memory auto [on|off]'));
}

// ── Command entry ──────────────────────────────────────────

export const call: import('../../types/command.js').LocalJSXCommandCall = async (onDone, _context, args) => {
  args = args?.trim() || '';

  if (!args) return <PeerMenu onDone={onDone} />;

  if (args === 'share') {
    await startSharing(msg => onDone(msg, { display: 'system' }));
    return;
  }

  if (args === 'share stop') {
    stopSharing(msg => onDone(msg, { display: 'system' }));
    return;
  }

  if (args === 'discover') {
    await doDiscover(msg => onDone(msg, { display: 'system' }));
    return;
  }

  if (args.startsWith('join ')) {
    const target = args.slice(5).trim();
    const parts = target.split(':');
    const host = parts.length > 1 ? parts[0]! : '127.0.0.1';
    const port = parseInt(parts[parts.length > 1 ? 1 : 0]!, 10);
    if (Number.isNaN(port)) {
      onDone(ansis.yellow('Usage: /peer join <port> or /peer join <host>:<port>'), { display: 'system' });
      return;
    }
    try {
      const url = `http://${host}:${port}/peer-info`;
      const startedAt = performance.now();
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const info = await res.json();
      const latencyMs = performance.now() - startedAt;
      const store = getGlobalPeerStore();
      store.addConnection({
        id: info.id ?? `${host}:${port}`,
        hostname: info.hostname ?? host,
        ip: info.ip ?? host,
        port: info.port ?? port,
        cwd: info.cwd ?? '',
        version: info.version ?? '',
        lastSeen: Date.now(),
        status: 'online',
        shell: info.shell,
        platform: info.platform,
        term: info.term,
        isBusy: info.isBusy === true,
        queueDepth: typeof info.queueDepth === 'number' ? info.queueDepth : 0,
        latencyMs,
      });
      onDone(ansis.dim(`Joined ${info.hostname ?? host} (port ${port})`), { display: 'system' });
    } catch (err) {
      onDone(ansis.red(`Failed to connect to ${host}:${port}: ${errorMessage(err)}`), { display: 'system' });
    }
    return;
  }

  if (args.startsWith('name ')) {
    const name = args.slice(5).trim();
    if (!name) {
      onDone(ansis.yellow('Usage: /peer name <new_name>'), { display: 'system' });
      return;
    }
    const store = getGlobalPeerStore();
    const discovery = getGlobalDiscovery();
    discovery.setLocalName(name);
    store.setPeerName(discovery.peerId, name);
    const server = getGlobalPeerServer();
    server.extraInfo.displayName = name;
    onDone(ansis.dim(`Set local display name to "${name}"`), { display: 'system' });
    return;
  }

  if (args.startsWith('role ')) {
    const role = args.slice(5).trim();
    if (!role) {
      onDone(ansis.yellow('Usage: /peer role <new_role>'), { display: 'system' });
      return;
    }
    const store = getGlobalPeerStore();
    const discovery = getGlobalDiscovery();
    store.setPeerRole(discovery.peerId, role);
    const server = getGlobalPeerServer();
    server.extraInfo.role = role;
    onDone(ansis.dim(`Set local role to "${role}"`), { display: 'system' });
    return;
  }

  if (args === 'list') return <PeerMenu onDone={onDone} />;

  if (args === 'peer') {
    onDone(formatPeerList(getGlobalPeerStore().getPeers(), sharingStatus()), { display: 'system' });
    return;
  }

  if (args.startsWith('send ')) {
    const rest = args.slice(5).trim();
    // /peer send <peer> <message...>
    const spaceIdx = rest.indexOf(' ');
    if (spaceIdx === -1) {
      onDone(ansis.yellow('Usage: /peer send <peer> <message>'), { display: 'system' });
      return;
    }
    const peerQuery = rest.slice(0, spaceIdx);
    const message = rest.slice(spaceIdx + 1);
    await sendMessage(peerQuery, message, msg => onDone(msg, { display: 'system' }));
    return;
  }

  if (args.startsWith('todo ')) {
    const rest = args.slice(5).trim();
    if (rest === 'done') {
      onDone(ansis.yellow('Usage: /peer todo done <id>'));
      return;
    }
    if (rest.startsWith('done ')) {
      markTodoDone(rest.slice(5).trim(), msg => onDone(msg, { display: 'system' }));
      return;
    }
    // /peer todo <peer> <task...>
    const spaceIdx = rest.indexOf(' ');
    if (spaceIdx === -1) {
      onDone(ansis.yellow('Usage: /peer todo <worker> <task description>'), { display: 'system' });
      return;
    }
    const peerQuery = rest.slice(0, spaceIdx);
    const task = rest.slice(spaceIdx + 1);
    await sendTask(peerQuery, task, msg => onDone(msg, { display: 'system' }));
    return;
  }

  if (args === 'todos') {
    showTodos(msg => onDone(msg, { display: 'system' }));
    return;
  }

  if (args === 'dashboard' || args === 'dash') {
    const dash = formatPeerTaskDashboard();
    if (!dash) {
      onDone(ansis.dim('No peer activity. Share or join peers first with /peer share or /peer join.'), {
        display: 'system',
      });
      return;
    }
    const summary = formatPeerTaskSummary();
    onDone([dash, '', ansis.dim(summary)].join('\n'), { display: 'system' });
    return;
  }

  if (args === 'memory') {
    onDone(ansis.dim('Usage: /peer memory sync | auto [on|off]'), { display: 'system' });
    return;
  }

  if (args === 'memory sync') {
    await runMemorySync(msg => onDone(msg, { display: 'system' }));
    return;
  }

  if (args.startsWith('memory auto')) {
    const rest = args.slice(11).trim();
    await runMemoryAuto(rest, msg => onDone(msg, { display: 'system' }));
    return;
  }

  if (args.startsWith('swarm') || args.startsWith('swarm ')) {
    const rest = args.slice(5).trim();
    await runSwarm(rest, (msg, opts) => onDone(msg, { ...opts, display: 'system' }));
    return;
  }

  // /peer inbox — show pending messages, inject into prompt on select
  if (args === 'inbox') {
    const messages = getGlobalPeerStore().getMessages();
    const todos = getGlobalPeerStore().getTodos();
    const inboxItems = [
      ...messages
        .filter(m => m.from !== 'local')
        .map(m => ({ type: 'msg' as const, text: `[${m.fromName}] ${m.text}`, raw: m.text })),
      ...todos
        .filter(t => t.status === 'pending' && t.from !== 'local')
        .map(t => ({ type: 'todo' as const, text: `[Task from ${t.fromName}] ${t.message}`, raw: t.message })),
    ];

    if (inboxItems.length === 0) {
      onDone(ansis.dim('No pending messages or tasks.'), { display: 'system' });
      return;
    }

    // Show first item and inject it
    const item = inboxItems[0]!;
    onDone(ansis.dim(`Inbox (${inboxItems.length}): ${item.text}`), {
      display: 'system',
      nextInput: item.raw,
      submitNextInput: true,
    });
    return;
  }

  if (args.startsWith('spawn') || args.startsWith('spawn ')) {
    const rest = args.slice(5).trim();
    const tokens = parseArgs(rest);
    const name = getFlagValue(tokens, '--name') ?? getFlagValue(tokens, '-n');
    const prompt = getFlagValue(tokens, '--prompt') ?? getFlagValue(tokens, '-p');
    const model = getFlagValue(tokens, '--model') ?? getFlagValue(tokens, '-m');
    const agent =
      getFlagValue(tokens, '--role') ??
      getFlagValue(tokens, '-r') ??
      getFlagValue(tokens, '--agent') ??
      getFlagValue(tokens, '-a');

    try {
      spawnPeerTerminal({ name, prompt, model, agent });
      onDone(ansis.dim(`Spawning new peer shell${name ? ` "${name}"` : ''}...`), { display: 'system' });
    } catch (err) {
      onDone(ansis.red(`Failed to spawn peer: ${errorMessage(err)}`), { display: 'system' });
    }
    return;
  }

  if (args === 'help' || args === '--help' || args === '-h') {
    onDone(
      [
        'Peer commands - Agent-to-Agent collaboration:',
        '  /peer share              Start sharing this Clew instance',
        '  /peer share stop         Stop sharing',
        '  /peer join <host>:<port> Connect to another Clew peer (e.g. /peer join 127.0.0.1:61459)',
        '  /peer list               Show connected Clew peers',
        '  /peer send <peer> <msg>  Send a message to a Clew peer',
        '  /peer todo <peer> <task> Assign a task to a Clew peer',
        '  /peer todos              Show received tasks',
        '  /peer todo done <id>     Mark task done',
        '  /peer memory sync         Import memories from all connected peers into MemoryDB',
        '  /peer memory auto [on|off] Toggle periodic memory sync via cron (default 60 min interval)',
        '                           👉 /peer memory auto on 30  (every 30 min)',
        '  /peer swarm <command>    Run command on ALL connected peers in parallel',
        '                           Options: -t, --timeout <sec> (default 60)',
        '                                    -f, --filter <pattern>',
        '                                    --dry-run',
        '  /peer inbox              View pending messages',
        '  /peer dashboard           Show peer task dashboard with todos and results',
        '  /peer health              Show LAN peer health, latency, and queue load',
        '  /peer spawn [options]    Spawn a new peer shell terminal window',
        '                           Options: -n, --name <name> (peer display name)',
        '                                    -p, --prompt <prompt> (custom system prompt)',
        '                                    -m, --model <model> (custom AI model)',
        '                                    -r, --role <role> (custom peer role)',
        '',
        'Local process runners:',
        '  /peer run codex <task>   Run the local Codex CLI once; this is not a LAN peer or /agent subagent',
        '                           Options: -C, --cwd <dir>; -m, --model <model>; -t, --timeout <seconds>',
        '',
        'Subagents:',
        '  Use /agent for managed Clew subagents. They are separate from /peer and Codex CLI.',
      ].join('\n'),
      { display: 'system' },
    );
    return;
  }

  onDone(ansis.yellow(`Unknown: /peer ${args}. Run /peer help.`), { display: 'system' });
};
