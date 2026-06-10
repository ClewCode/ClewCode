/**
 * `/remote` slash command — provider-agnostic Remote Control.
 *
 * Subcommands:
 *   listen [--port PORT] [--host HOST]    Start a RemoteServer
 *   connect <url> --token <token>         Connect to a remote server
 *   token [--generate] [--list] [--revoke]  Manage auth tokens
 */

import type { LocalCommandResult, LocalJSXCommandContext } from '../../types/command.js';

export async function call(args: string, _context: LocalJSXCommandContext): Promise<LocalCommandResult> {
  const trimmed = args.trim();
  const tokens = trimmed.split(/\s+/);
  const verb = (tokens[0]?.toLowerCase() ?? '') as string;
  const { generateToken, listTokens, revokeToken } = await import('../../remote/tokenStore.js');

  switch (verb) {
    case 'listen':
      return handleListen(tokens.slice(1), generateToken);
    case 'connect':
      return handleConnect(tokens.slice(1));
    case 'exec':
      return handleExec(tokens.slice(1));
    case 'token':
      return handleToken(tokens.slice(1), listTokens, revokeToken, generateToken);
    case '':
    case 'help':
      return { type: 'text', value: HELP_TEXT };
    default:
      return { type: 'text', value: `Unknown: ${verb}\n${HELP_TEXT}` };
  }
}

// ─── handle listen ──────────────────────────────────────────────────────

async function handleListen(
  tokens: string[],
  generateTokenFn: (label?: string) => { raw: string; entry: { id: string; label: string } },
): Promise<LocalCommandResult> {
  const g = globalThis as any;
  if (g.__remoteServer) {
    if (tokens.includes('--stop') || tokens.includes('-s')) {
      await g.__remoteServer.stop();
      g.__remoteServer = null;
      if (g.__relayClient) {
        g.__relayClient.disconnect();
        g.__relayClient = null;
      }
      return { type: 'text', value: '◈ remote · server stopped.' };
    }
    const a = g.__remoteServer.address;
    return {
      type: 'text',
      value: `◈ remote · running on ws://${a?.host ?? '?'}:${a?.port ?? '?'}\nStop: /remote listen --stop`,
    };
  }

  let port = 0,
    host = '127.0.0.1',
    relayUrl: string | undefined;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t === '--port' || t === '-p') {
      port = parseInt(tokens[++i] ?? '', 10) || 0;
    } else if (t === '--host') {
      host = tokens[++i] ?? '127.0.0.1';
    } else if (t === '--relay') {
      relayUrl = tokens[++i];
    }
  }

  const { raw } = generateTokenFn('remote-listen');
  try {
    const { RemoteServer } = await import('../../remote/RemoteServer.js');
    const { RemoteBridge } = await import('../../remote/RemoteBridge.js');

    const bridge = new RemoteBridge();
    g.__remoteBridge = bridge;

    const server = new RemoteServer(
      { host, port, authToken: raw, relayUrl, maxSessions: 8, idleTimeoutMs: 1_800_000 },
      {
        onMessage: (sessionId, message) => void bridge.handleMessage(sessionId, message),
        onSessionStart: sessionId => {
          bridge.setSend((data: string) => server.sendMessage(sessionId, data));
        },
      },
    );
    const addr = await server.start();
    g.__remoteServer = server;

    if (relayUrl) {
      const { RelayClient } = await import('../../remote/RelayClient.js');
      const relay = new RelayClient(relayUrl, 'listener', raw, {
        onMessage: (data: string) => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'data') {
              const msg = typeof parsed.payload === 'string' ? JSON.parse(parsed.payload) : parsed.payload;
              void bridge.handleMessage('relay', msg);
            }
          } catch {
            /* ignore non-JSON */
          }
        },
        onConnected: () => {
          bridge.setSend((data: string) => relay.send(data));
        },
      });
      relay.connect();
      g.__relayClient = relay;
    }

    const hostD = host === '0.0.0.0' ? '<your-ip>' : host;
    const relayInfo = relayUrl ? `\n  Relay: ${relayUrl}` : '';
    return {
      type: 'text',
      value:
        `◈ remote · server started\n  URL: ws://${hostD}:${addr.port}\n  Token: ${raw}\n  Port: ${addr.port}${relayInfo}\n\n` +
        `Connect: /remote connect ws://${hostD}:${addr.port} --token ${raw}\nStop: /remote listen --stop`,
    };
  } catch (err: unknown) {
    return { type: 'text', value: `◈ remote · failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ─── handle exec ───────────────────────────────────────────────────────

async function handleExec(tokens: string[]): Promise<LocalCommandResult> {
  const g = globalThis as any;
  const connector = g.__remoteConnector as import('../../remote/RemoteConnector.js').RemoteConnector | undefined;
  if (!connector) {
    return { type: 'text', value: '◈ remote · not connected. Run /remote connect first.' };
  }

  const command = tokens.join(' ');
  if (!command) {
    return { type: 'text', value: 'Usage: /remote exec <command>' };
  }

  const sent = connector.sendCommand(command);
  return {
    type: 'text',
    value: sent
      ? `◈ remote · sent: ${command}\nWaiting for response...`
      : '◈ remote · failed to send command (not connected)',
  };
}

// ─── handle connect ─────────────────────────────────────────────────────

async function handleConnect(tokens: string[]): Promise<LocalCommandResult> {
  const url = tokens.find(t => t.startsWith('ws://') || t.startsWith('wss://'));
  const tokenIdx = tokens.indexOf('--token');
  const token = tokenIdx !== -1 ? tokens[tokenIdx + 1] : undefined;
  const isRelay = tokens.includes('--relay') || tokens.includes('-r');

  if (!url) {
    return { type: 'text', value: 'Usage: /remote connect <url> --token <token> [--relay]' };
  }

  if (isRelay) {
    // Relay mode: connect and set up command forwarding
    try {
      const { RemoteConnector } = await import('../../remote/RemoteConnector.js');
      const connector = new RemoteConnector({
        onConnected: () => {
          (globalThis as any).__remoteCmdMode = true;
        },
        onResult: result => {
          if (result.output) {
            process.stdout.write(`\n${result.output}\n\n`);
          }
          if (result.error) {
            process.stdout.write(`\n${result.error}\n\n`);
          }
        },
        onError: error => {
          process.stdout.write(`\nError: ${error}\n`);
        },
      });

      connector.connect(url, token ?? '');
      (globalThis as any).__remoteConnector = connector;

      return {
        type: 'text',
        value: `◈ remote · connected via relay\n  URL: ${url}\n  Token: ${token ?? '(none)'}\n\nWaiting for pairing...`,
      };
    } catch (err: unknown) {
      return { type: 'text', value: `◈ remote · failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  // Direct mode: HTTP + REST + WebSocket
  const httpUrl = url.replace(/^ws:\/\//, 'http://').replace(/\/ws.*$/, '');

  try {
    // 1. Health check
    const health = await fetch(`${httpUrl}/health`, { signal: AbortSignal.timeout(5000) });
    if (!health.ok) throw new Error(`Server health check failed (${health.status})`);

    // 2. Create session
    const sessionRes = await fetch(`${httpUrl}/v1/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ cwd: process.cwd() }),
      signal: AbortSignal.timeout(5000),
    });

    if (!sessionRes.ok) {
      const errBody = await sessionRes.text().catch(() => '');
      throw new Error(`Session creation failed (${sessionRes.status}): ${errBody.slice(0, 200)}`);
    }

    const sessionData = (await sessionRes.json()) as { session_id: string; ws_url: string };
    const wsUrl = sessionData.ws_url || `${url}?session_id=${sessionData.session_id}`;

    (globalThis as any).__remoteConnection = {
      wsUrl,
      sessionId: sessionData.session_id,
      serverUrl: httpUrl,
    };

    return {
      type: 'text',
      value: `◈ remote · connected!\n  Server: ${httpUrl}\n  Session: ${sessionData.session_id}\n  WS: ${wsUrl}`,
    };
  } catch (err: unknown) {
    return { type: 'text', value: `◈ remote · failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ─── handle token ───────────────────────────────────────────────────────

async function handleToken(
  tokens: string[],
  listTokensFn: typeof import('../../remote/tokenStore.js').listTokens,
  revokeTokenFn: typeof import('../../remote/tokenStore.js').revokeToken,
  generateTokenFn: typeof import('../../remote/tokenStore.js').generateToken,
): Promise<LocalCommandResult> {
  const verb = (tokens[0] ?? '').toLowerCase();

  if (verb === '--generate' || verb === '--gen' || verb === '-g') {
    const label = tokens.slice(1).join(' ') || undefined;
    const { raw, entry } = generateTokenFn(label);
    return {
      type: 'text',
      value: `◈ remote · token generated\n  Token: ${raw}\n  ID: ${entry.id}\n  Label: ${entry.label}\n  Expires: ${entry.expiresAt ? new Date(entry.expiresAt).toLocaleString() : 'never'}`,
    };
  }

  if (verb === '--list' || verb === '-l') {
    const entries = listTokensFn();
    if (!entries.length) return { type: 'text', value: '◈ remote · no tokens.' };
    const lines = ['◈ remote · tokens:'];
    for (const e of entries) {
      const st = e.consumedAt ? 'used' : e.expiresAt && Date.now() > e.expiresAt ? 'expired' : 'active';
      lines.push(`  ${st.padEnd(8)} ${e.id.slice(0, 8)}  ${e.label}  ${new Date(e.createdAt).toLocaleString()}`);
    }
    return { type: 'text', value: lines.join('\n') };
  }

  if (verb === '--revoke' || verb === '-r') {
    const id = tokens[1];
    if (!id) return { type: 'text', value: 'Usage: /remote token --revoke <id>' };
    return {
      type: 'text',
      value: revokeTokenFn(id) ? `◈ remote · token ${id.slice(0, 8)} revoked.` : `◈ remote · token not found: ${id}`,
    };
  }

  return {
    type: 'text',
    value: 'Usage:\n  /remote token --generate [label]\n  /remote token --list\n  /remote token --revoke <id>',
  };
}

const HELP_TEXT = `◈ remote — provider-agnostic Remote Control

Subcommands:
  listen [--port PORT] [--host HOST]    Start server (direct)
  listen --relay <url> [--token T]      Start server via relay (cross-network)
  connect <url> --token T [--relay]     Connect to server/relay
  exec <command>                         Execute command on remote host
  token --generate [label]              Create token
  token --list                          List tokens
  token --revoke <id>                   Revoke token

Flow:
  Host:   /remote listen --relay ws://relay.io --token secret
  Client: /remote connect ws://relay.io --token secret --relay
  Client: /remote exec "ls -la"

Examples:
  /remote listen --port 9876
  /remote connect ws://host:9876 --token clew-rt-xxxx
  /remote exec "cat package.json"`;
