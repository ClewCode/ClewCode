import { spawn as childSpawn } from 'node:child_process';
import { z } from 'zod/v4';
import { getGlobalDiscovery } from '../../swarm/SwarmDiscovery.js';
import { getGlobalSwarmStore } from '../../swarm/SwarmStore.js';
import { buildTool } from '../../Tool.js';
import { getCwd } from '../../utils/cwd.js';
import { errorMessage } from '../../utils/errors.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { getMainLoopModel } from '../../utils/model/model.js';
import { DESCRIPTION, SWARM_SPAWN_TOOL_NAME, PROMPT } from './prompt.js';

const inputSchema = lazySchema(() =>
  z.object({
    name: z.string().optional().describe('Display name for the peer. If not provided, a random name is generated.'),
    role: z.string().optional().describe('Agent role for the peer (e.g. builder, tester, reviewer)'),
    model: z.string().optional().describe('Model for the peer session (e.g. sonnet)'),
    prompt: z.string().optional().describe('Custom system prompt for the peer session'),
    autoJoin: z.boolean().optional().default(true).describe('Whether to automatically join the peer after spawning'),
  }),
);

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean(),
    name: z.string().optional(),
    role: z.string().optional(),
    id: z.string().optional(),
    hostname: z.string().optional(),
    ip: z.string().optional(),
    port: z.number().optional(),
    cwd: z.string().optional(),
    joined: z.boolean().optional(),
    attempts: z.number().optional(),
    discovered: z.number().optional(),
    command: z.string().optional(),
    diagnostics: z.string().optional(),
    error: z.string().optional(),
  }),
);

export type Output = z.infer<ReturnType<typeof outputSchema>>;

function quoteArg(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function buildPeerSpawnCommand(args: string[]): string {
  const mainScript = process.argv[1] ?? '';
  const cliArgs = [
    ...(mainScript
      ? mainScript.endsWith('.tsx') || mainScript.endsWith('.ts')
        ? ['run', mainScript]
        : [mainScript]
      : []),
    ...args,
  ];
  return `${quoteArg(process.execPath)} ${cliArgs.map(quoteArg).join(' ')}`;
}

export const SwarmSpawnTool = buildTool({
  isConcurrencySafe() {
    return true;
  },
  isReadOnly() {
    return false;
  },
  name: SWARM_SPAWN_TOOL_NAME,
  searchHint: 'spawn a new peer terminal',
  maxResultSizeChars: 2_000,
  async description() {
    return DESCRIPTION;
  },
  async prompt() {
    return PROMPT;
  },
  get inputSchema() {
    return inputSchema();
  },
  get outputSchema() {
    return outputSchema();
  },
  getPath() {
    return getCwd();
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    if (!output.success)
      return { tool_use_id: toolUseID, type: 'tool_result', content: `[Peer Spawn] Failed: ${output.error}` };
    const joinText = output.joined
      ? `auto-joined ${output.hostname}:${output.port} (${output.id})`
      : `spawned but not joined${output.diagnostics ? `: ${output.diagnostics}` : ''}`;
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content:
        `Spawned peer "${output.name}" with role "${output.role ?? 'none'}" - ${joinText}` +
        (output.command ? `\ncommand: ${output.command}` : ''),
    };
  },
  async call(input: { name?: string; role?: string; model?: string; prompt?: string; autoJoin?: boolean }) {
    const randomId = Math.random().toString(36).substring(2, 7);
    const targetName = input.name || `peer-${randomId}`;

    try {
      const cwd = process.cwd();
      const platform = process.platform;

      // Default peer behavior: share → receive task → reply back to sender
      const DEFAULT_SWARM_PROMPT =
        'You are a spawned peer. You are already sharing via --peer-share.\n' +
        '\n' +
        '=== FLOW WHEN RECEIVING A TASK ===\n' +
        '1. SHARE — Run `swarm_share status` to confirm sharing and learn your port.\n' +
        '   Your port is how the sender will reach you.\n' +
        '2. RECEIVE — A task message arrives from a sender. It should include:\n' +
        '   - Sender\'s peer name (e.g. "I am {name}")\n' +
        '   - Sender\'s port (e.g. "on port {port}")\n' +
        '   - The task description\n' +
        '3. DO — Complete the task using your tools.\n' +
        '4. REPLY — Send the result back via:\n' +
        '   `swarm_send_message({ peer: "<sender_swarm_name>", message: "<result>" })`\n' +
        '   Do NOT use waitResponse — just send the result.\n' +
        '\n' +
        '=== RULES ===\n' +
        '- Always confirm your port first with `swarm_share status`\n' +
        "- When replying, use the sender's peer name (not hostname)\n" +
        '- Include the task result clearly in the message\n' +
        '- If unsure about a command, use --help to explore\n' +
        '\n' +
        '=== TOOLS ===\n' +
        'Prefer MCP tools over built-in tools when available. ' +
        'MCP tools (tinyfish, firecrawl) return richer results with full page content, ' +
        'while built-in tools may fall back to limited providers.';

      const effectivePrompt = input.prompt ? `${input.prompt}\n\n${DEFAULT_SWARM_PROMPT}` : DEFAULT_SWARM_PROMPT;

      // Use same model as the main session
      const spawnModel = input.model || getMainLoopModel();
      const cliArgs = ['--peer-share', '--peer-name', targetName, '--name', targetName, '--model', spawnModel];
      const promptArg = effectivePrompt.replace(/\s*\r?\n\s*/g, ' ').trim();
      if (promptArg) cliArgs.push('--system-prompt', promptArg);
      const cmd = buildPeerSpawnCommand(cliArgs);
      const commandPreview = buildPeerSpawnCommand([
        '--peer-share',
        '--peer-name',
        targetName,
        '--name',
        targetName,
        '--model',
        spawnModel,
        '--system-prompt',
        '<prompt>',
      ]);

      if (platform === 'win32') {
        childSpawn('cmd.exe', ['/c', `start "Clew Peer - ${targetName}" cmd.exe /k ${cmd}`], {
          cwd,
          detached: true,
          stdio: 'ignore',
        }).unref();
      } else if (platform === 'darwin') {
        const appleScript = `tell application "Terminal" to do script "${cmd}"`;
        childSpawn('osascript', ['-e', appleScript], {
          detached: true,
          stdio: 'ignore',
        }).unref();
      } else {
        childSpawn('x-terminal-emulator', ['-e', 'sh', '-c', `${cmd}; exec sh`], {
          detached: true,
          stdio: 'ignore',
        })
          .on('error', () => {
            childSpawn('gnome-terminal', ['--', 'sh', '-c', `${cmd}; exec sh`], {
              detached: true,
              stdio: 'ignore',
            });
          })
          .unref();
      }

      let joined = false;
      let attempts = 0;
      let discovered = 0;
      let joinedPeer:
        | {
            id?: string;
            hostname?: string;
            ip?: string;
            port?: number;
            cwd?: string;
          }
        | undefined;

      if (input.autoJoin !== false) {
        const store = getGlobalSwarmStore();
        const discovery = getGlobalDiscovery();
        const maxAttempts = 30; // 15 seconds

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          attempts = attempt + 1;
          await new Promise(resolve => setTimeout(resolve, 500));

          try {
            const peers = await discovery.discoverPeers(1000);
            discovered = peers.length;
            for (const p of peers) store.addPeer(p);

            const peer =
              peers.find(p => p.hostname === targetName || p.id === targetName) ?? store.findPeer(targetName);
            if (!peer || swarm.port === 0) continue;

            const res = await fetch(`http://${peer.ip || '127.0.0.1'}:${swarm.port}/swarm-info`, {
              signal: AbortSignal.timeout(2000),
            });
            if (!res.ok) continue;

            const info = (await res.json()) as {
              id?: string;
              hostname?: string;
              ip?: string;
              port?: number;
              cwd?: string;
              version?: string;
              shell?: string;
              platform?: string;
              term?: string;
              displayName?: string;
            };
            const swarmId = info.id ?? peer.id;
            const swarmHost = info.hostname ?? peer.hostname;
            const swarmIp = info.ip ?? peer.ip ?? '127.0.0.1';
            const swarmPort = info.port ?? swarm.port;

            store.addConnection({
              id: swarmId,
              hostname: swarmHost,
              ip: swarmIp,
              port: swarmPort,
              cwd: info.cwd ?? peer.cwd,
              version: info.version ?? peer.version ?? '',
              lastSeen: Date.now(),
              status: 'online',
              shell: info.shell ?? peer.shell,
              platform: info.platform ?? peer.platform,
              term: info.term ?? peer.term,
            });

            if (info.displayName) store.setPeerName(swarmId, info.displayName);
            if (input.role) store.setPeerRole(swarmId, input.role);

            joined = true;
            joinedPeer = {
              id: swarmId,
              hostname: swarmHost,
              ip: swarmIp,
              port: swarmPort,
              cwd: info.cwd ?? peer.cwd,
            };
          } catch {
            // Spawned process may still be booting.
          }

          if (joined) break;
        }
      }

      return {
        data: {
          success: true,
          name: targetName,
          role: input.role,
          id: joinedPeer?.id,
          hostname: joinedPeer?.hostname,
          ip: joinedPeer?.ip,
          port: joinedPeer?.port,
          cwd: joinedPeer?.cwd,
          joined,
          attempts,
          discovered,
          command: commandPreview,
          diagnostics: joined
            ? undefined
            : `no matching peer "${targetName}" appeared after ${attempts} attempt(s); discovered ${discovered} peer(s)`,
        },
      };
    } catch (err) {
      return {
        data: {
          success: false,
          error: `Failed to spawn peer: ${errorMessage(err)}`,
        },
      };
    }
  },
});
