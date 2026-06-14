/**
 * /mesh — Peer discovery and task assignment
 *
 * A "lead peer" discovers "worker peers" on the LAN and assigns them tasks.
 *
 * Usage:
 *   /mesh share              Become a worker (advertise on LAN + file)
 *   /mesh share stop         Stop advertising
 *   /mesh                    Open interactive peer list
 *   /mesh discover           Scan for workers (non-interactive)
 *   /mesh todo <peer> <task> Assign a task to a worker
 *   /mesh todos              Show received tasks
 *   /mesh todo done <id>     Mark task complete
 */

import chalk from 'chalk';
import { spawn as childSpawn } from 'child_process';
import { getGlobalDiscovery } from '../../mesh/MeshDiscovery.js';
import { getGlobalMeshServer } from '../../mesh/MeshServer.js';
import { getGlobalMeshStore } from '../../mesh/MeshStore.js';
import { getProcessMeshProvider, getProcessMeshProviderIds } from '../../mesh/ProcessMeshProvider.js';
import type { MeshInfo } from '../../mesh/types.js';
import { errorMessage } from '../../utils/errors.js';
import { formatMeshList } from './MeshList.js';
import MeshMenu from './MeshMenu.js';

let myMeshId = '';

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

function spawnMeshTerminal(options: { name?: string; prompt?: string; model?: string; agent?: string }): void {
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
  if (platform === 'win32') {
    childSpawn('cmd.exe', ['/c', 'start', 'cmd.exe', '/k', fullCommand], {
      detached: true,
      stdio: 'ignore',
      shell: true,
    });
  } else if (platform === 'darwin') {
    const appleScript = `tell application "Terminal" to do script "${fullCommand.replace(/"/g, '\\"')}"`;
    childSpawn('osascript', ['-e', appleScript], {
      detached: true,
      stdio: 'ignore',
    });
  } else {
    childSpawn('x-terminal-emulator', ['-e', fullCommand], {
      detached: true,
      stdio: 'ignore',
    }).on('error', () => {
      childSpawn('gnome-terminal', ['--', 'sh', '-c', `${fullCommand}; exec sh`], {
        detached: true,
        stdio: 'ignore',
      });
    });
  }
}

async function startSharing(onDone: (msg: string) => void): Promise<void> {
  if (sharingStatus()) {
    onDone(chalk.dim('Already sharing. Run /mesh share stop to stop.'));
    return;
  }

  try {
    const discovery = getGlobalDiscovery();
    const server = getGlobalMeshServer();
    myMeshId = discovery.meshId;

    // Sync display name + role to peer server for remote peers to see
    const tags = getGlobalMeshStore().getPeerTags(discovery.meshId);
    if (tags?.displayName) server.extraInfo.displayName = tags.displayName;
    if (tags?.role) server.extraInfo.role = tags.role;

    // Always set callbacks (overwrites main.tsx defaults to include enqueue and onExec)
    server.setCallbacks({
      onTodo: todo => {
        getGlobalMeshStore().addTodo(todo);
        import('../../utils/messageQueueManager.js').then(({ enqueue }) => {
          enqueue({ value: `Task from ${todo.fromName}: ${todo.message}`, mode: 'prompt', priority: 'next' });
        });
      },
      onMessage: msg => {
        getGlobalMeshStore().addMessage(msg);
        import('../../utils/messageQueueManager.js').then(({ enqueue }) => {
          enqueue({ value: `From ${msg.fromName}: ${msg.text}`, mode: 'prompt', priority: 'next' });
        });
      },
      onExec: async (command: string) => {
        const { executeCommand } = await import('../../tools/MeshRunTool/MeshRunTool.js');
        return executeCommand(command, 60_000);
      },
    });

    // Start server if needed (idempotent)
    let port: number;
    if (server.port > 0) {
      port = server.port;
    } else {
      const meshInfo: MeshInfo = {
        id: myMeshId,
        hostname: discovery.hostname,
        ip: '127.0.0.1',
        port: 0,
        cwd: process.cwd(),
        version: '',
        lastSeen: Date.now(),
        status: 'online',
      };
      port = await server.start(meshInfo);
    }

    await discovery.startAdvertising(port, process.cwd());
    onDone(chalk.dim(`Sharing (port ${port}). Others can find you with /mesh discover.`));
  } catch (err) {
    onDone(chalk.red(`Failed: ${errorMessage(err)}`));
  }
}

function stopSharing(onDone: (msg: string) => void): void {
  if (!sharingStatus()) {
    onDone(chalk.dim('Not sharing.'));
    return;
  }
  getGlobalDiscovery().stopAdvertising();
  getGlobalMeshServer().stop();
  onDone(chalk.dim('Stopped sharing.'));
}

async function doDiscover(onDone: (msg: string) => void): Promise<void> {
  try {
    const peers = await getGlobalDiscovery().discoverPeers(3000);
    if (peers.length === 0) {
      onDone(chalk.dim('No peers found.'));
      return;
    }
    const lines = ['Available peers:', ''];
    for (const peer of peers) {
      lines.push(`  /mesh join ${peer.ip}:${peer.port}`);
    }
    onDone(lines.join('\n'));
  } catch (err) {
    onDone(chalk.red(`Failed: ${errorMessage(err)}`));
  }
}

async function sendMessage(swarmQuery: string, text: string, onDone: (msg: string) => void): Promise<void> {
  try {
    const store = getGlobalMeshStore();
    const peer = store.findPeer(swarmQuery);
    if (!peer) {
      onDone(chalk.red(`Peer "${swarmQuery}" not found. Run /mesh discover first.`));
      return;
    }

    const url = `http://${peer.ip}:${peer.port}/mesh-msg`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: myMeshId || getMyName(),
        fromName: getMyName(),
        text: text,
      }),
    });

    if (!response.ok) {
      onDone(chalk.red(`Failed to send message to ${peer.hostname}: HTTP ${response.status}`));
      return;
    }

    const result = await response.json();
    onDone(chalk.dim(`Message sent to ${peer.hostname} (id: ${result.id})`));
  } catch (err) {
    onDone(chalk.red(`Failed: ${errorMessage(err)}`));
  }
}

async function sendTask(swarmQuery: string, text: string, onDone: (msg: string) => void): Promise<void> {
  try {
    const store = getGlobalMeshStore();
    const peer = store.findPeer(swarmQuery);
    if (!peer) {
      onDone(chalk.red(`Worker "${swarmQuery}" not found. Run /mesh discover first.`));
      return;
    }

    const url = `http://${peer.ip}:${peer.port}/mesh-todo`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: myMeshId || getMyName(),
        fromName: getMyName(),
        message: text,
      }),
    });

    if (!response.ok) {
      onDone(chalk.red(`Failed to send task to ${peer.hostname}: HTTP ${response.status}`));
      return;
    }

    const result = await response.json();
    onDone(chalk.dim(`Task sent to ${peer.hostname} (id: ${result.id})`));
  } catch (err) {
    onDone(chalk.red(`Failed: ${errorMessage(err)}`));
  }
}

type ProcessMeshRunArgs = {
  providerId: string;
  prompt: string;
  cwd?: string;
  model?: string;
  timeoutMs?: number;
};

function parseProcessMeshRunArgs(rest: string): ProcessMeshRunArgs | { error: string } {
  const tokens = parseArgs(rest);
  const providerId = tokens.shift();
  if (!providerId) {
    return { error: `Usage: /mesh run <${getProcessMeshProviderIds().join('|')}> [options] <task>` };
  }

  const promptTokens: string[] = [];
  let cwd: string | undefined;
  let model: string | undefined;
  let timeoutMs: number | undefined;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token === '--cwd' || token === '-C') {
      cwd = tokens[++i];
      continue;
    }
    if (token === '--model' || token === '-m') {
      model = tokens[++i];
      continue;
    }
    if (token === '--timeout' || token === '-t') {
      const raw = tokens[++i];
      const seconds = Number(raw);
      if (!Number.isFinite(seconds) || seconds <= 0) {
        return { error: '--timeout must be a positive number of seconds' };
      }
      timeoutMs = Math.round(seconds * 1000);
      continue;
    }
    promptTokens.push(token);
  }

  const prompt = promptTokens.join(' ').trim();
  if (!prompt) {
    return { error: `Usage: /mesh run ${providerId} [options] <task>` };
  }

  return { providerId, prompt, cwd, model, timeoutMs };
}

async function runProcessPeer(rest: string, onDone: (msg: string) => void): Promise<void> {
  const parsed = parseProcessMeshRunArgs(rest);
  if ('error' in parsed) {
    onDone(chalk.yellow(parsed.error));
    return;
  }

  const provider = getProcessMeshProvider(parsed.providerId);
  if (!provider) {
    onDone(
      chalk.red(
        `Unknown process worker provider "${parsed.providerId}". Available: ${getProcessMeshProviderIds().join(', ')}`,
      ),
    );
    return;
  }

  try {
    const result = await provider.runTask({
      prompt: parsed.prompt,
      cwd: parsed.cwd,
      model: parsed.model,
      timeoutMs: parsed.timeoutMs,
    });
    const output = result.stdout.trim() || result.stderr.trim() || '(no output)';
    const status =
      result.exitCode === 0 && !result.timedOut
        ? chalk.dim(`${provider.label} peer finished in ${(result.durationMs / 1000).toFixed(1)}s`)
        : chalk.red(
            `${provider.label} peer failed${result.timedOut ? ' (timed out)' : ''}: exit ${result.exitCode ?? result.signal ?? 'unknown'}`,
          );

    onDone([status, '', output].join('\n'));
  } catch (err) {
    onDone(chalk.red(`Failed to run ${provider.label} peer: ${errorMessage(err)}`));
  }
}

function showTodos(onDone: (msg: string) => void): void {
  const todos = getGlobalMeshStore().getTodos();
  if (todos.length === 0) {
    onDone(chalk.dim('No pending tasks.'));
    return;
  }
  const lines = ['Pending tasks:', ''];
  for (const todo of todos) {
    const status =
      todo.status === 'pending'
        ? chalk.yellow('pending')
        : todo.status === 'done'
          ? chalk.green('done')
          : chalk.red('rejected');
    lines.push(`  ${chalk.bold(todo.id.slice(0, 12))}  ${status}  from ${todo.fromName}: ${todo.message}`);
  }
  onDone(lines.join('\n'));
}

function markTodoDone(id: string, onDone: (msg: string) => void): void {
  if (getGlobalMeshStore().updateTodoStatus(id, 'done')) {
    onDone(chalk.dim(`Task ${id} done.`));
  } else {
    onDone(chalk.red(`Task "${id}" not found.`));
  }
}

// ── Command entry ──────────────────────────────────────────

export const call: import('../../types/command.js').LocalJSXCommandCall = async (onDone, _context, args) => {
  args = args?.trim() || '';

  if (!args) return <MeshMenu onDone={onDone} />;

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
      onDone(chalk.yellow('Usage: /mesh join <port> or /mesh join <host>:<port>'), { display: 'system' });
      return;
    }
    try {
      const url = `http://${host}:${port}/mesh-info`;
      const startedAt = performance.now();
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const info = await res.json();
      const latencyMs = performance.now() - startedAt;
      const store = getGlobalMeshStore();
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
      onDone(chalk.dim(`Joined ${info.hostname ?? host} (port ${port})`), { display: 'system' });
    } catch (err) {
      onDone(chalk.red(`Failed to connect to ${host}:${port}: ${errorMessage(err)}`), { display: 'system' });
    }
    return;
  }

  if (args.startsWith('name ')) {
    const name = args.slice(5).trim();
    if (!name) {
      onDone(chalk.yellow('Usage: /mesh name <new_name>'), { display: 'system' });
      return;
    }
    const store = getGlobalMeshStore();
    const discovery = getGlobalDiscovery();
    discovery.setLocalName(name);
    store.setPeerName(discovery.meshId, name);
    const server = getGlobalMeshServer();
    server.extraInfo.displayName = name;
    onDone(chalk.dim(`Set local display name to "${name}"`), { display: 'system' });
    return;
  }

  if (args.startsWith('role ')) {
    const role = args.slice(5).trim();
    if (!role) {
      onDone(chalk.yellow('Usage: /mesh role <new_role>'), { display: 'system' });
      return;
    }
    const store = getGlobalMeshStore();
    const discovery = getGlobalDiscovery();
    store.setPeerRole(discovery.meshId, role);
    const server = getGlobalMeshServer();
    server.extraInfo.role = role;
    onDone(chalk.dim(`Set local role to "${role}"`), { display: 'system' });
    return;
  }

  if (args === 'list') return <MeshMenu onDone={onDone} />;

  if (args === 'mesh') {
    onDone(formatMeshList(getGlobalMeshStore().getPeers(), sharingStatus()), { display: 'system' });
    return;
  }

  if (args.startsWith('send ')) {
    const rest = args.slice(5).trim();
    // /mesh send <peer> <message...>
    const spaceIdx = rest.indexOf(' ');
    if (spaceIdx === -1) {
      onDone(chalk.yellow('Usage: /mesh send <peer> <message>'), { display: 'system' });
      return;
    }
    const swarmQuery = rest.slice(0, spaceIdx);
    const message = rest.slice(spaceIdx + 1);
    await sendMessage(swarmQuery, message, msg => onDone(msg, { display: 'system' }));
    return;
  }

  if (args.startsWith('todo ')) {
    const rest = args.slice(5).trim();
    if (rest === 'done') {
      onDone(chalk.yellow('Usage: /mesh todo done <id>'));
      return;
    }
    if (rest.startsWith('done ')) {
      markTodoDone(rest.slice(5).trim(), msg => onDone(msg, { display: 'system' }));
      return;
    }
    // /mesh todo <peer> <task...>
    const spaceIdx = rest.indexOf(' ');
    if (spaceIdx === -1) {
      onDone(chalk.yellow('Usage: /mesh todo <worker> <task description>'), { display: 'system' });
      return;
    }
    const swarmQuery = rest.slice(0, spaceIdx);
    const task = rest.slice(spaceIdx + 1);
    await sendTask(swarmQuery, task, msg => onDone(msg, { display: 'system' }));
    return;
  }

  if (args === 'todos') {
    showTodos(msg => onDone(msg, { display: 'system' }));
    return;
  }

  if (args.startsWith('run ')) {
    await runProcessPeer(args.slice(4).trim(), msg => onDone(msg, { display: 'system' }));
    return;
  }

  // /mesh inbox — show pending messages, inject into prompt on select
  if (args === 'inbox') {
    const messages = getGlobalMeshStore().getMessages();
    const todos = getGlobalMeshStore().getTodos();
    const inboxItems = [
      ...messages
        .filter(m => m.from !== 'local')
        .map(m => ({ type: 'msg' as const, text: `[${m.fromName}] ${m.text}`, raw: m.text })),
      ...todos
        .filter(t => t.status === 'pending' && t.from !== 'local')
        .map(t => ({ type: 'todo' as const, text: `[Task from ${t.fromName}] ${t.message}`, raw: t.message })),
    ];

    if (inboxItems.length === 0) {
      onDone(chalk.dim('No pending messages or tasks.'), { display: 'system' });
      return;
    }

    // Show first item and inject it
    const item = inboxItems[0]!;
    onDone(chalk.dim(`Inbox (${inboxItems.length}): ${item.text}`), {
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
      spawnMeshTerminal({ name, prompt, model, agent });
      onDone(chalk.dim(`Spawning new peer shell${name ? ` "${name}"` : ''}...`), { display: 'system' });
    } catch (err) {
      onDone(chalk.red(`Failed to spawn peer: ${errorMessage(err)}`), { display: 'system' });
    }
    return;
  }

  if (args === 'help' || args === '--help' || args === '-h') {
    onDone(
      [
        'Mesh commands - Agent-to-Agent collaboration:',
        '  /mesh share              Start sharing this Clew instance',
        '  /mesh share stop         Stop sharing',
        '  /mesh join <host>:<port> Connect to another Clew peer (e.g. /mesh join 127.0.0.1:61459)',
        '  /mesh list               Show connected Clew peers',
        '  /mesh send <peer> <msg>  Send a message to a Clew peer',
        '  /mesh todo <peer> <task> Assign a task to a Clew peer',
        '  /mesh todos              Show received tasks',
        '  /mesh todo done <id>     Mark task done',
        '  /mesh inbox              View pending messages',
        '  /mesh mesh               Show LAN mesh health, latency, and queue load',
        '  /mesh spawn [options]    Spawn a new peer shell terminal window',
        '                           Options: -n, --name <name> (peer display name)',
        '                                    -p, --prompt <prompt> (custom system prompt)',
        '                                    -m, --model <model> (custom AI model)',
        '                                    -r, --role <role> (custom peer role)',
        '',
        'Local process runners:',
        '  /mesh run codex <task>   Run the local Codex CLI once; this is not a LAN peer or /agent subagent',
        '                           Options: -C, --cwd <dir>; -m, --model <model>; -t, --timeout <seconds>',
        '',
        'Subagents:',
        '  Use /agent for managed Clew subagents. They are separate from /mesh and Codex CLI.',
      ].join('\n'),
      { display: 'system' },
    );
    return;
  }

  onDone(chalk.yellow(`Unknown: /mesh ${args}. Run /mesh help.`), { display: 'system' });
};
