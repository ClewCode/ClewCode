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

import chalk from 'chalk';
import type * as React from 'react';
import { spawn as childSpawn } from 'child_process';
import { getGlobalDiscovery } from '../../peer/PeerDiscovery.js';
import { getGlobalPeerServer } from '../../peer/PeerServer.js';
import { getGlobalPeerStore } from '../../peer/PeerStore.js';
import type { PeerInfo } from '../../peer/types.js';
import { logForDebugging } from '../../utils/debug.js';
import { errorMessage } from '../../utils/errors.js';
import { formatPeerList } from './PeerList.js';
import PeerMenu from './PeerMenu.js';

let myPeerId = '';
const myName = '';

function sharingStatus(): boolean {
  try { return getGlobalDiscovery().isSharing; } catch { return false; }
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
    ...(process.argv[1].endsWith('.tsx') || process.argv[1].endsWith('.ts') ? ['run', mainScript] : [mainScript])
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
    onDone(chalk.dim('Already sharing. Run /peer share stop to stop.'));
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
      onTodo: (todo) => {
        getGlobalPeerStore().addTodo(todo);
        import('../../utils/messageQueueManager.js').then(({ enqueue }) => {
          enqueue({ value: `Task from ${todo.fromName}: ${todo.message}`, mode: 'prompt', priority: 'next' });
        });
      },
      onMessage: (msg) => {
        getGlobalPeerStore().addMessage(msg);
        import('../../utils/messageQueueManager.js').then(({ enqueue }) => {
          enqueue({ value: `From ${msg.fromName}: ${msg.text}`, mode: 'prompt', priority: 'next' });
        });
      },
      onExec: async (command: string) => {
        const { executeCommand } = await import('../../tools/PeerRunTool/PeerRunTool.js');
        return executeCommand(command, 60_000);
      }
    });

    // Start server if needed (idempotent)
    let port: number;
    if (server.port > 0) {
      port = server.port;
    } else {
      const peerInfo: PeerInfo = {
        id: myPeerId,
        hostname: discovery.hostname,
        ip: '',
        port: 0,
        cwd: process.cwd(),
        version: '',
        lastSeen: Date.now(),
        status: 'online',
      };
      port = await server.start(peerInfo);
    }

    await discovery.startAdvertising(port, process.cwd());
    onDone(chalk.dim(`Sharing (port ${port}). Others can find you with /peer discover.`));
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
  getGlobalPeerServer().stop();
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
      lines.push(`  /peer join ${peer.ip}:${peer.port}`);
    }
    onDone(lines.join('\n'));
  } catch (err) {
    onDone(chalk.red(`Failed: ${errorMessage(err)}`));
  }
}

async function sendMessage(peerQuery: string, text: string, onDone: (msg: string) => void): Promise<void> {
  try {
    const store = getGlobalPeerStore();
    const peer = store.findPeer(peerQuery);
    if (!peer) {
      onDone(chalk.red(`Peer "${peerQuery}" not found. Run /peer discover first.`));
      return;
    }

    const url = `http://${peer.ip}:${peer.port}/peer-msg`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: myPeerId || getMyName(),
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

async function sendTask(peerQuery: string, text: string, onDone: (msg: string) => void): Promise<void> {
  try {
    const store = getGlobalPeerStore();
    const peer = store.findPeer(peerQuery);
    if (!peer) {
      onDone(chalk.red(`Worker "${peerQuery}" not found. Run /peer discover first.`));
      return;
    }

    const url = `http://${peer.ip}:${peer.port}/peer-todo`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: myPeerId || getMyName(),
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

function showTodos(onDone: (msg: string) => void): void {
  const todos = getGlobalPeerStore().getTodos();
  if (todos.length === 0) {
    onDone(chalk.dim('No pending tasks.'));
    return;
  }
  const lines = ['Pending tasks:', ''];
  for (const todo of todos) {
    const status = todo.status === 'pending' ? chalk.yellow('pending') : todo.status === 'done' ? chalk.green('done') : chalk.red('rejected');
    lines.push(`  ${chalk.bold(todo.id.slice(0, 12))}  ${status}  from ${todo.fromName}: ${todo.message}`);
  }
  onDone(lines.join('\n'));
}

function markTodoDone(id: string, onDone: (msg: string) => void): void {
  if (getGlobalPeerStore().updateTodoStatus(id, 'done')) {
    onDone(chalk.dim(`Task ${id} done.`));
  } else {
    onDone(chalk.red(`Task "${id}" not found.`));
  }
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
    if (isNaN(port)) {
      onDone(chalk.yellow('Usage: /peer join <port> or /peer join <host>:<port>'), { display: 'system' });
      return;
    }
    try {
      const url = `http://${host}:${port}/peer-info`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const info = await res.json();
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
      });
      onDone(chalk.dim(`Joined ${info.hostname ?? host} (port ${port})`), { display: 'system' });
    } catch (err) {
      onDone(chalk.red(`Failed to connect to ${host}:${port}: ${errorMessage(err)}`), { display: 'system' });
    }
    return;
  }

  if (args === 'list') return <PeerMenu onDone={onDone} />;

  if (args.startsWith('send ')) {
    const rest = args.slice(5).trim();
    // /peer send <peer> <message...>
    const spaceIdx = rest.indexOf(' ');
    if (spaceIdx === -1) {
      onDone(chalk.yellow('Usage: /peer send <peer> <message>'), { display: 'system' });
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
      onDone(chalk.yellow('Usage: /peer todo done <id>'));
      return;
    }
    if (rest.startsWith('done ')) {
      markTodoDone(rest.slice(5).trim(), msg => onDone(msg, { display: 'system' }));
      return;
    }
    // /peer todo <peer> <task...>
    const spaceIdx = rest.indexOf(' ');
    if (spaceIdx === -1) {
      onDone(chalk.yellow('Usage: /peer todo <worker> <task description>'), { display: 'system' });
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

  // /peer inbox — show pending messages, inject into prompt on select
  if (args === 'inbox') {
    const messages = getGlobalPeerStore().getMessages();
    const todos = getGlobalPeerStore().getTodos();
    const inboxItems = [
      ...messages.filter(m => m.from !== 'local').map(m => ({ type: 'msg' as const, text: `[${m.fromName}] ${m.text}`, raw: m.text })),
      ...todos.filter(t => t.status === 'pending' && t.from !== 'local').map(t => ({ type: 'todo' as const, text: `[Task from ${t.fromName}] ${t.message}`, raw: t.message })),
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
    const agent = getFlagValue(tokens, '--role') ?? getFlagValue(tokens, '-r') ?? getFlagValue(tokens, '--agent') ?? getFlagValue(tokens, '-a');

    try {
      spawnPeerTerminal({ name, prompt, model, agent });
      onDone(chalk.dim(`Spawning new peer shell${name ? ` "${name}"` : ''}...`), { display: 'system' });
    } catch (err) {
      onDone(chalk.red(`Failed to spawn peer: ${errorMessage(err)}`), { display: 'system' });
    }
    return;
  }

  if (args === 'help' || args === '--help' || args === '-h') {
    onDone([
      'Peer commands:',
      '  /peer share              Start sharing (listen for connections)',
      '  /peer share stop         Stop sharing',
      '  /peer join <host>:<port> Connect to a peer (e.g. /peer join 127.0.0.1:61459)',
      '  /peer list               Show connected peers',
      '  /peer send <peer> <msg>  Send a message to a peer',
      '  /peer todo <peer> <task> Assign a task to a peer',
      '  /peer todos              Show received tasks',
      '  /peer todo done <id>     Mark task done',
      '  /peer inbox              View pending messages',
      '  /peer spawn [options]    Spawn a new peer shell terminal window',
      '                           Options: -n, --name <name> (peer display name)',
      '                                    -p, --prompt <prompt> (custom system prompt)',
      '                                    -m, --model <model> (custom AI model)',
      '                                    -r, --role <role> / -a, --agent <agent> (custom agent role)',
    ].join('\n'), { display: 'system' });
    return;
  }

  onDone(chalk.yellow(`Unknown: /peer ${args}. Run /peer help.`), { display: 'system' });
};
