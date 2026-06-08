import { spawn as childSpawn } from 'node:child_process';
import { z } from 'zod/v4';
import { getGlobalDiscovery } from '../../peer/PeerDiscovery.js';
import { getGlobalPeerStore } from '../../peer/PeerStore.js';
import { buildTool } from '../../Tool.js';
import { getCwd } from '../../utils/cwd.js';
import { errorMessage } from '../../utils/errors.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { DESCRIPTION, PEER_SPAWN_TOOL_NAME, PROMPT } from './prompt.js';

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
    port: z.number().optional(),
    joined: z.boolean().optional(),
    error: z.string().optional(),
  }),
);

export type Output = z.infer<ReturnType<typeof outputSchema>>;

export const PeerSpawnTool = buildTool({
  isConcurrencySafe() {
    return true;
  },
  isReadOnly() {
    return false;
  },
  name: PEER_SPAWN_TOOL_NAME,
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
    const joinText = output.joined ? `and auto-joined on port ${output.port}` : '(spawned in background)';
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: `✓ Spawned peer "${output.name}" with role "${output.role ?? 'none'}" ${joinText}`,
    };
  },
  async call(input: { name?: string; role?: string; model?: string; prompt?: string; autoJoin?: boolean }) {
    const randomId = Math.random().toString(36).substring(2, 7);
    const targetName = input.name || `peer-${randomId}`;

    try {
      const mainScript = process.argv[1]!;
      const args = [
        ...(process.argv[1].endsWith('.tsx') || process.argv[1].endsWith('.ts') ? ['run', mainScript] : [mainScript]),
      ];

      args.push('--peer-name', targetName);

      if (input.prompt) {
        args.push('--system-prompt', input.prompt);
      }
      if (input.model) {
        args.push('--model', input.model);
      }
      if (input.role) {
        args.push('--agent', input.role);
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

      let joined = false;
      let detectedPort: number | undefined;

      if (input.autoJoin !== false) {
        const discovery = getGlobalDiscovery();
        const store = getGlobalPeerStore();
        const maxAttempts = 30; // 15 seconds

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 500));

          const peers = await discovery.discoverPeers(100);
          const found = peers.find(p => p.hostname === targetName);

          if (found) {
            try {
              const url = `http://${found.ip}:${found.port}/peer-info`;
              const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
              if (res.ok) {
                const info = await res.json();
                store.addConnection({
                  id: info.id ?? found.id,
                  hostname: info.hostname ?? targetName,
                  ip: info.ip ?? found.ip,
                  port: info.port ?? found.port,
                  cwd: info.cwd ?? found.cwd,
                  version: info.version ?? '',
                  lastSeen: Date.now(),
                  status: 'online',
                  shell: info.shell,
                  platform: info.platform,
                  term: info.term,
                });

                if (info.displayName) store.setPeerName(info.id, info.displayName);
                if (info.role || input.role) {
                  store.setPeerRole(info.id, input.role || info.role);
                }

                joined = true;
                detectedPort = found.port;
                break;
              }
            } catch {
              // Wait and retry - HTTP server might not be running yet
            }
          }
        }
      }

      return {
        data: {
          success: true,
          name: targetName,
          role: input.role,
          port: detectedPort,
          joined,
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
