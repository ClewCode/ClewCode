import { spawn as childSpawn } from 'node:child_process';
import { z } from 'zod/v4';
import { getGlobalDiscovery } from '../../mesh/MeshDiscovery.js';
import { getGlobalMeshStore } from '../../mesh/MeshStore.js';
import { buildTool } from '../../Tool.js';
import { getCwd } from '../../utils/cwd.js';
import { errorMessage } from '../../utils/errors.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { getMainLoopModel } from '../../utils/model/model.js';
import { DESCRIPTION, MESH_SPAWN_TOOL_NAME, PROMPT } from './prompt.js';

const inputSchema = lazySchema(() =>
  z.object({
    name: z.string().optional().describe('Display name for the mesh node. If not provided, a random name is generated.'),
    role: z.string().optional().describe('Agent role for the mesh node (e.g. builder, tester, reviewer)'),
    model: z.string().optional().describe('Model for the mesh node session (e.g. sonnet)'),
    prompt: z.string().optional().describe('Custom system prompt for the mesh node session'),
    autoJoin: z.boolean().optional().default(true).describe('Whether to automatically join the mesh node after spawning'),
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
  const escaped = value.replace(/"/g, isWin32() ? '""' : '\\"');
  return `"${escaped}"`;
}

function isWin32(): boolean {
  return process.platform === 'win32';
}

function buildMeshSpawnCommand(args: string[]): string {
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

export const MeshSpawnTool = buildTool({
  isConcurrencySafe() {
    return true;
  },
  isReadOnly() {
    return false;
  },
  name: MESH_SPAWN_TOOL_NAME,
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
      return { tool_use_id: toolUseID, type: 'tool_result', content: `[Mesh Spawn] Failed: ${output.error}` };
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
      const DEFAULT_MESH_PROMPT =
        'You are a spawned peer. You are already sharing via --peer-share.\n' +
        '\n' +
        '=== FLOW WHEN RECEIVING A TASK ===\n' +
        '1. SHARE — Run `mesh_share status` to confirm sharing and learn your port.\n' +
        '   Your port is how the sender will reach you.\n' +
        '2. RECEIVE — A task message arrives from a sender. It should include:\n' +
        '   - Sender\'s mesh name (e.g. "I am {name}")\n' +
        '   - Sender\'s port (e.g. "on port {port}")\n' +
        '   - The task description\n' +
        '3. DO — Complete the task using your tools.\n' +
        '4. REPLY — Send the result back via:\n' +
        '   `mesh_send_message({ peer: "<sender_mesh_name>", message: "<result>" })`\n' +
        '   Do NOT use waitResponse — just send the result.\n' +
        '\n' +
        '=== RULES ===\n' +
        '- Always confirm your port first with `mesh_share status`\n' +
        "- When replying, use the sender's mesh name (not hostname)\n" +
        '- Include the task result clearly in the message\n' +
        '- If unsure about a command, use --help to explore\n' +
        '\n' +
        '=== TOOLS ===\n' +
        'Prefer MCP tools over built-in tools when available. ' +
        'MCP tools (tinyfish, firecrawl) return richer results with full page content, ' +
        'while built-in tools may fall back to limited providers.';

      const effectivePrompt = input.prompt ? `${input.prompt}\n\n${DEFAULT_MESH_PROMPT}` : DEFAULT_MESH_PROMPT;

      // Use same model as the main session
      const spawnModel = input.model || getMainLoopModel();
      const cliArgs = ['--peer-share', '--peer-name', targetName, '--name', targetName, '--model', spawnModel];
      const promptArg = effectivePrompt.replace(/\s*\r?\n\s*/g, ' ').trim();
      if (promptArg) cliArgs.push('--system-prompt', promptArg);
      const cmd = buildMeshSpawnCommand(cliArgs);
      const commandPreview = buildMeshSpawnCommand([
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
        const clewCmd = `${process.env.APPDATA}\\npm\\clew.cmd`;
        const quotedArgs = cliArgs.map(a => a.includes(' ') ? quoteArg(a) : `"${a}"`).join(' ');
        const winCmd = `start "Clew Mesh - ${targetName}" cmd.exe /k "cd /d "${cwd}" && "${clewCmd}" ${quotedArgs}"`;
        childSpawn('cmd.exe', ['/c', winCmd], {
          cwd,
          detached: true,
          stdio: 'ignore',
          windowsVerbatimArguments: true,
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
      let joinedMesh:
        | {
            id?: string;
            hostname?: string;
            ip?: string;
            port?: number;
            cwd?: string;
          }
        | undefined;

      if (input.autoJoin !== false) {
        const store = getGlobalMeshStore();
        const discovery = getGlobalDiscovery();
        const maxAttempts = 30; // 15 seconds

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          attempts = attempt + 1;
          await new Promise(resolve => setTimeout(resolve, 500));

          try {
            const peers = await discovery.discoverMeshs(1000);
            discovered = peers.length;
            for (const p of peers) store.addMesh(p);

            const peer =
              peers.find(p => p.hostname === targetName || p.id === targetName) ?? store.findMesh(targetName);
            if (!peer || peer.port === 0) continue;

            const res = await fetch(`http://${peer.ip || '127.0.0.1'}:${peer.port}/mesh-info`, {
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
            const meshId = info.id ?? peer.id;
            const meshHost = info.hostname ?? peer.hostname;
            const meshIp = info.ip ?? peer.ip ?? '127.0.0.1';
            const meshPort = info.port ?? peer.port;

            store.addConnection({
              id: meshId,
              hostname: meshHost,
              ip: meshIp,
              port: meshPort,
              cwd: info.cwd ?? peer.cwd,
              version: info.version ?? peer.version ?? '',
              lastSeen: Date.now(),
              status: 'online',
              shell: info.shell ?? peer.shell,
              platform: info.platform ?? peer.platform,
              term: info.term ?? peer.term,
            });

            if (info.displayName) store.setMeshName(meshId, info.displayName);
            if (input.role) store.setMeshRole(meshId, input.role);

            joined = true;
            joinedMesh = {
              id: meshId,
              hostname: meshHost,
              ip: meshIp,
              port: meshPort,
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
          id: joinedMesh?.id,
          hostname: joinedMesh?.hostname,
          ip: joinedMesh?.ip,
          port: joinedMesh?.port,
          cwd: joinedMesh?.cwd,
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
