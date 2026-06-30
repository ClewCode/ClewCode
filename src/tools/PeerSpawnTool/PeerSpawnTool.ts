import { spawn as childSpawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as React from 'react';
import { z } from 'zod/v4';
import { Text } from '../../ink.js';
import { buildTool } from '../../Tool.js';
import { getCwd } from '../../utils/cwd.js';
import { errorMessage } from '../../utils/errors.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { getMainLoopModel } from '../../utils/model/model.js';
import { DESCRIPTION, PEER_SPAWN_TOOL_NAME, PROMPT } from './prompt.js';

const inputSchema = lazySchema(() =>
  z.object({
    name: z
      .string()
      .optional()
      .describe('Display name for the peer node. If not provided, a random name is generated.'),
    role: z.string().optional().describe('Agent role for the peer node (e.g. builder, tester, reviewer)'),
    model: z.string().optional().describe('Model for the peer node session (e.g. sonnet)'),
    prompt: z.string().optional().describe('Custom system prompt for the peer node session'),
  }),
);

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean(),
    name: z.string().optional(),
    role: z.string().optional(),
    port: z.number().optional(),
    joined: z.boolean().optional(),
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
  renderToolUseMessage(input: Partial<{ name?: string; role?: string }>) {
    return React.createElement(
      Text,
      null,
      React.createElement(Text, { bold: true }, '⚙ spawn'),
      ` ${input.name ?? 'peer'}${input.role ? ` (${input.role})` : ''}`,
    );
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    if (!output.success)
      return { tool_use_id: toolUseID, type: 'tool_result', content: `[Peer Spawn] Failed: ${output.error}` };
    const result = `Spawned peer "${output.name}"${output.role ? ` (${output.role})` : ''} on port ${output.port}`;
    return { tool_use_id: toolUseID, type: 'tool_result', content: result };
  },
  async call(input: { name?: string; role?: string; model?: string; prompt?: string }) {
    const randomId = Math.random().toString(36).substring(2, 7);
    const targetName = input.name || `peer-${randomId}`;

    try {
      const cwd = process.cwd();
      const platform = process.platform;

      // Environment passed to the spawned peer.
      const childEnv: NodeJS.ProcessEnv = { ...process.env };

      // Default peer behavior: share → receive task → reply back to sender
      const DEFAULT_PEER_PROMPT =
        'You are a spawned peer. You are already sharing via --peer-share.\n' +
        '\n' +
        '=== FLOW WHEN RECEIVING A TASK ===\n' +
        '1. SHARE — Run `peer_share status` to confirm sharing and learn your port.\n' +
        '   Your port is how the sender will reach you.\n' +
        '2. RECEIVE — A task message arrives from a sender. It should include:\n' +
        '   - Sender\'s peer name (e.g. "I am {name}")\n' +
        '   - Sender\'s port (e.g. "on port {port}")\n' +
        '   - The task description\n' +
        '3. DO — Complete the task using your tools.\n' +
        '4. REPLY — Send the result back via:\n' +
        '   `peer_send_message({ peer: "<sender_peer_name>", message: "<result>" })`\n' +
        '   Do NOT use waitResponse — just send the result.\n' +
        '\n' +
        '=== RULES ===\n' +
        '- Always confirm your port first with `peer_share status`\n' +
        "- When replying, use the sender's peer name (not hostname)\n" +
        '- Include the task result clearly in the message\n' +
        '- If unsure about a command, use --help to explore\n' +
        '\n' +
        '=== TOOLS ===\n' +
        'Prefer MCP tools over built-in tools when available. ' +
        'MCP tools (tinyfish, firecrawl) return richer results with full page content, ' +
        'while built-in tools may fall back to limited providers.';

      const effectivePrompt = input.prompt ? `${input.prompt}\n\n${DEFAULT_PEER_PROMPT}` : DEFAULT_PEER_PROMPT;

      // Use same model as the main session
      const spawnModel = input.model || getMainLoopModel();
      const cliArgs = ['--peer-share', '--peer-name', targetName, '--name', targetName, '--model', spawnModel];
      const promptArg = effectivePrompt.replace(/\s*\r?\n\s*/g, ' ').trim();
      if (promptArg) cliArgs.push('--system-prompt', promptArg);
      const cmd = buildPeerSpawnCommand(cliArgs);
      const previewArgs = ['--peer-share', '--peer-name', targetName, '--name', targetName, '--model', spawnModel];
      previewArgs.push('--system-prompt', '<prompt>');
      const commandPreview = buildPeerSpawnCommand(previewArgs);

      // In dev (running from .ts/.tsx source) spawn the peer from the SAME
      // source as the parent so code changes apply to both; in prod use the
      // installed clew binary.
      const mainScript = process.argv[1] ?? '';
      const isDev = mainScript.endsWith('.tsx') || mainScript.endsWith('.ts');

      if (platform === 'win32') {
        // Use a PowerShell script (.ps1) instead of a batch file, and pass the
        // system prompt via a FILE (--system-prompt-file) rather than as a
        // command-line argument.
        //
        // Two distinct Windows quoting bugs make inline argument passing unsafe:
        //   1. cmd.exe treats < and > as redirectors even inside "quoted" strings,
        //      so the <placeholders> in the prompt corrupt batch-file parsing and
        //      cause clew to print --help.
        //   2. Windows PowerShell 5.1 does NOT escape embedded double-quotes when
        //      it builds the Win32 command line for a native exe (`& $exe @args`).
        //      The prompt contains literal " chars (e.g. `"I am {name}"`,
        //      `peer: "<sender_peer_name>"`), each of which toggles the quoting
        //      state and splits the argument on the next space — so clew receives
        //      the prompt as many bare operands and dies with
        //      "too many arguments. Expected 1 argument but got N".
        //
        // Writing the prompt to a temp file and passing only its PATH sidesteps
        // both: the path has no spaces/quotes/<> chars, so no shell or
        // CreateProcess quoting layer can mangle it. clew reads the file verbatim.
        const safeName = targetName.replace(/[^a-zA-Z0-9_-]/g, '_');
        const ps1Path = join(tmpdir(), `clew-peer-${safeName}-${randomId}.ps1`);
        const promptFilePath = join(tmpdir(), `clew-peer-${safeName}-${randomId}.prompt.txt`);

        // The prompt file keeps the original multi-line prompt verbatim — no
        // need to collapse newlines now that it is never a command-line arg.
        writeFileSync(promptFilePath, effectivePrompt, 'utf8');

        // cliArgs already includes --system-prompt <inline>; drop it (flag +
        // value) and pass --system-prompt-file <path> instead.
        const promptFlagIdx = cliArgs.lastIndexOf('--system-prompt');
        const cliArgsBase = promptFlagIdx >= 0 ? cliArgs.slice(0, promptFlagIdx) : [...cliArgs];

        // Executable to invoke + its arguments (same logic as buildPeerSpawnCommand).
        const execPath = process.execPath;
        const innerArgs = [
          ...(isDev ? ['run', mainScript, ...cliArgsBase] : [mainScript, ...cliArgsBase]),
          '--system-prompt-file',
          promptFilePath,
        ];

        // In PS1, single-quoted strings are fully literal; escape ' as ''.
        const ps1q = (s: string) => s.replace(/'/g, "''");
        // Build an args array and splat it (& $exe @args). Every element is a
        // single-quoted literal (no embedded " to confuse CreateProcess), so the
        // 5.1 quoting bug above cannot trigger. Splatting passes each element as
        // a separate argument cleanly.
        const argsArrayPs1 = innerArgs.map(a => `'${ps1q(a)}'`).join(', ');

        const ps1Content = [
          `$host.UI.RawUI.WindowTitle = 'Clew Peer - ${ps1q(targetName)}'`,
          `Set-Location '${ps1q(cwd)}'`,
          `$clewArgs = @(${argsArrayPs1})`,
          `& '${ps1q(execPath)}' @clewArgs`,
          ``,
        ].join('\r\n');

        writeFileSync(ps1Path, ps1Content, 'utf8');

        // `start ""` opens a new independent console window; -NoExit keeps it
        // open after clew exits so the user can see any final output.
        childSpawn(
          'cmd.exe',
          ['/c', 'start', '""', 'powershell.exe', '-NoExit', '-ExecutionPolicy', 'Bypass', '-File', ps1Path],
          { cwd, detached: true, stdio: 'ignore', windowsVerbatimArguments: true, env: childEnv },
        ).unref();
      } else if (platform === 'darwin') {
        const appleScript = `tell application "Terminal" to do script "${cmd.replace(/"/g, '\\"')}"`;
        childSpawn('osascript', ['-e', appleScript], {
          detached: true,
          stdio: 'ignore',
          env: childEnv,
        }).unref();
      } else {
        childSpawn('x-terminal-emulator', ['-e', 'sh', '-c', `${cmd}; exec sh`], {
          detached: true,
          stdio: 'ignore',
          env: childEnv,
        })
          .on('error', () => {
            childSpawn('gnome-terminal', ['--', 'sh', '-c', `${cmd}; exec sh`], {
              detached: true,
              stdio: 'ignore',
              env: childEnv,
            });
          })
          .unref();
      }

      return {
        data: {
          success: true,
          name: targetName,
          role: input.role,
          port: 0,
          joined: false,
          command: commandPreview,
          diagnostics: `Terminal spawned for peer "${targetName}". Use peer_discover to find it.`,
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
