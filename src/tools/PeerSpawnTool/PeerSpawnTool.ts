import { exec as childExec, spawn as childSpawn } from 'node:child_process';
import { readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { z } from 'zod/v4';
import { getGlobalDiscovery } from '../../peer/PeerDiscovery.js';
import { getGlobalPeerStore } from '../../peer/PeerStore.js';
import { buildTool } from '../../Tool.js';
import { getCwd } from '../../utils/cwd.js';
import { errorMessage } from '../../utils/errors.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { getMainLoopModel } from '../../utils/model/model.js';
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
      const cwd = process.cwd();
      const platform = process.platform;

      // Default peer behavior: when receiving a message, reply back to sender
      const DEFAULT_PEER_PROMPT =
        'You are a spawned peer agent. ' +
        'When you receive a message from another peer via peer_send_message, ' +
        'you MUST reply back using peer_send_message with waitResponse: true. ' +
        'Use the sender\'s fromName or hostname as the "peer" parameter when replying.\n\n' +
        'Prefer MCP tools over built-in tools when available. ' +
        'MCP tools (tinyfish, firecrawl) return richer results with full page content, ' +
        'while built-in tools may fall back to limited providers.';

      const effectivePrompt = input.prompt ? `${input.prompt}\n\n${DEFAULT_PEER_PROMPT}` : DEFAULT_PEER_PROMPT;

      // Use same model as the main session
      const spawnModel = input.model || getMainLoopModel();
      let cmd = `cd "${cwd}" && bun run start --peer-share --peer-name "${targetName}" --name "${targetName}" --model "${spawnModel}"`;
      cmd += ` --system-prompt "${effectivePrompt.replace(/"/g, '\\"')}"`;
      const visualName = `Clew Peer - ${targetName}`;

      if (platform === 'win32') {
        // Windows: use start command (simple, no system prompt to avoid quoting issues)
        const winArgs = `--peer-share --peer-name ${targetName} --name "${targetName}" --model ${spawnModel}`;
        childExec(`start "Clew Peer - ${targetName}" /D "${cwd}" bun run start ${winArgs}`, {
          cwd,
          windowsHide: false,
        });
      } else if (platform === 'darwin') {
        const appleScript = `tell application "Terminal" to do script "${cmd}"`;
        childSpawn('osascript', ['-e', appleScript], {
          detached: true,
          stdio: 'ignore',
        });
      } else {
        childSpawn('x-terminal-emulator', ['-e', 'sh', '-c', `${cmd}; exec sh`], {
          detached: true,
          stdio: 'ignore',
        }).on('error', () => {
          childSpawn('gnome-terminal', ['--', 'sh', '-c', `${cmd}; exec sh`], {
            detached: true,
            stdio: 'ignore',
          });
        });
      }

      let joined = false;
      let detectedPort: number | undefined;

      if (input.autoJoin !== false) {
        const store = getGlobalPeerStore();
        const maxAttempts = 30; // 15 seconds
        const myPid = process.pid;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 500));

          // Scan peer files directly (same machine) — more reliable than UDP
          try {
            const peerDir = path.join(os.homedir(), '.claude', 'peers');
            const dir = readdirSync(peerDir, { withFileTypes: true });
            for (const entry of dir) {
              if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
              if (entry.name === `${myPid}.json`) continue; // skip self

              const filePath = path.join(peerDir, entry.name);
              try {
                const data = JSON.parse(readFileSync(filePath, 'utf-8')) as {
                  port?: number;
                  id?: string;
                  ip?: string;
                  hostname?: string;
                  cwd?: string;
                  pid?: number;
                };
                if (!data.port || data.port === 0) continue;
                const peerId = data.id ?? `pid-${data.pid}`;

                // Check if already connected
                if (store.findPeer(peerId)) continue;

                // Verify HTTP server is running
                const url = `http://${data.ip || '127.0.0.1'}:${data.port}/peer-info`;
                const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
                if (!res.ok) continue;

                const info = await res.json();
                store.addConnection({
                  id: info.id ?? data.id,
                  hostname: info.hostname ?? data.hostname,
                  ip: info.ip ?? data.ip ?? '127.0.0.1',
                  port: info.port ?? data.port,
                  cwd: info.cwd ?? data.cwd,
                  version: info.version ?? '',
                  lastSeen: Date.now(),
                  status: 'online',
                  shell: info.shell,
                  platform: info.platform,
                  term: info.term,
                });

                if (info.displayName) store.setPeerName(peerId, info.displayName);
                if (input.role) store.setPeerRole(peerId, input.role);

                joined = true;
                detectedPort = data.port;
                break;
              } catch {
                // File might be stale or server not ready
              }
            }
          } catch {
            // Peer dir might not exist
          }

          if (joined) break;
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
