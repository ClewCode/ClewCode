/**
 * Background session CLI — Wraps sessionManager with CLI-compatible signatures.
 *
 * Called from cli.tsx for commands: ps, logs, attach, kill, --bg, --background
 */

import {
  attachCommand,
  bgFlagHandler as createBgSession,
  listSessionsCommand,
  logsCommand,
  stopCommand,
} from './sessionManager.js';

export async function psHandler(args: string[]): Promise<void> {
  await listSessionsCommand();
}

export async function logsHandler(sessionId?: string): Promise<void> {
  await logsCommand(sessionId);
}

export async function attachHandler(sessionId?: string): Promise<void> {
  await attachCommand(sessionId);
}

export async function killHandler(sessionId?: string): Promise<void> {
  await stopCommand(sessionId);
}

export async function handleBgFlag(args: string[]): Promise<void> {
  // Parse --bg flag: prompt comes after the flag
  const bgIndex = args.findIndex(a => a === '--bg' || a === '--background');
  let prompt: string | undefined;
  let agent: string | undefined;
  let model: string | undefined;
  let permissionMode: string | undefined;
  let fallbackModel: string | undefined;
  let allowDangerouslySkipPermissions: string | undefined;
  const addDir: string[] = [];
  let settings: string | undefined;
  let mcpConfig: string | undefined;
  const pluginDir: string[] = [];
  let strictMcpConfig: string | undefined;

  // Collect args after --bg as the prompt, checking for other flags
  const trailing = args.slice(bgIndex + 1);
  const nonFlagArgs: string[] = [];

  for (let i = 0; i < trailing.length; i++) {
    const arg = trailing[i];
    if (arg === '--agent' && trailing[i + 1]) {
      agent = trailing[++i];
    } else if (arg === '--model' && trailing[i + 1]) {
      model = trailing[++i];
    } else if (arg === '--permission-mode' && trailing[i + 1]) {
      permissionMode = trailing[++i];
    } else if (arg === '--fallback-model' && trailing[i + 1]) {
      fallbackModel = trailing[++i];
    } else if (arg === '--allow-dangerously-skip-permissions') {
      allowDangerouslySkipPermissions = 'true';
    } else if (arg === '--add-dir' && trailing[i + 1]) {
      addDir.push(trailing[++i]!);
    } else if (arg === '--settings' && trailing[i + 1]) {
      settings = trailing[++i];
    } else if (arg === '--mcp-config' && trailing[i + 1]) {
      mcpConfig = trailing[++i];
    } else if (arg === '--plugin-dir' && trailing[i + 1]) {
      pluginDir.push(trailing[++i]!);
    } else if (arg === '--strict-mcp-config' && trailing[i + 1]) {
      strictMcpConfig = trailing[++i];
    } else {
      nonFlagArgs.push(arg!);
    }
  }

  prompt = nonFlagArgs.join(' ') || undefined;

  const id = await createBgSession(prompt ?? '(interactive)', agent, model, permissionMode, {
    fallbackModel,
    allowDangerouslySkipPermissions,
    addDir: addDir.length > 0 ? addDir : undefined,
    settings,
    mcpConfig,
    pluginDir: pluginDir.length > 0 ? pluginDir : undefined,
    strictMcpConfig,
  });
  // createBgSession already prints the formatted output
}
