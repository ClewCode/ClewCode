/**
 * ACP (Agent Communication Protocol) REST API Server.
 *
 * Exposes REST endpoints for external ACP/A2A-compatible agents to:
 * - Discover Clew Code as an agent (GET /agents)
 * - Execute tasks (POST /runs)
 * - Check run status (GET /runs/:id)
 * - Stream run events (GET /runs/:id/stream)
 * - Cancel runs (DELETE /runs/:id)
 *
 * Spec: https://agentcommunicationprotocol.dev
 * SDK: acp-sdk (i-am-bee / Linux Foundation A2A)
 */

import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { ACPRestConfig } from './ACPRestConfig.js';
import { createClewCodeManifest } from './ACPAgentManifest.js';
import { createRun, getRun, cancelRun } from './ACPRunManager.js';
import { textToACPMessage, resultToACPMessage, acpMessagesToPrompt } from './ACPMessageConverter.js';
import { getProcessSwarmProvider } from '../swarm/ProcessSwarmProvider.js';
import { logForDebugging } from '../utils/debug.js';

let server: ReturnType<typeof createServer> | null = null;

/**
 * Start the ACP REST API server.
 */
export async function startACPRestServer(config: ACPRestConfig): Promise<void> {
  if (!config.enabled) return;

  return new Promise((resolve, reject) => {
    server = createServer((req, res) => {
      handleRequest(req, res);
    });

    server.on('error', (err: Error) => {
      logForDebugging(`[ACP-REST] Server error: ${err.message}`);
      reject(err);
    });

    server.listen(config.port, config.host, () => {
      logForDebugging(`[ACP-REST] Server listening on http://${config.host}:${config.port}`);
      // biome-ignore lint/suspicious/noConsole: intentional startup message
      console.log(`ACP REST API running at http://${config.host}:${config.port}`);
      resolve();
    });
  });
}

/**
 * Stop the ACP REST API server.
 */
export function stopACPRestServer(): void {
  if (server) {
    server.close();
    server = null;
    logForDebugging('[ACP-REST] Server stopped');
  }
}

/**
 * Parse the URL path to get route params.
 */
function parsePath(url: string | undefined): { pathname: string; params: Record<string, string> } {
  const parsed = new URL(url ?? '/', 'http://localhost');
  const segments = parsed.pathname.split('/').filter(Boolean);
  const params: Record<string, string> = {};

  // /runs/:id, /runs/:id/stream
  if (segments[0] === 'runs' && segments[1]) {
    params.id = segments[1];
    if (segments[2] === 'stream') {
      params.stream = 'true';
    }
  }

  return { pathname: parsed.pathname, params };
}

/**
 * Handle an incoming HTTP request.
 */
async function handleRequest(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
): Promise<void> {
  try {
    const method = req.method?.toUpperCase() ?? 'GET';
    const { pathname, params } = parsePath(req.url);

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // GET /ping
    if (method === 'GET' && pathname === '/ping') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    // GET /agents — list all available agents
    if (method === 'GET' && pathname === '/agents') {
      const manifest = createClewCodeManifest();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ agents: [manifest] }));
      return;
    }

    // GET /agents/:name — get specific agent info
    if (method === 'GET' && pathname.startsWith('/agents/')) {
      const manifest = createClewCodeManifest();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(manifest));
      return;
    }

    // POST /runs — create a new run
    if (method === 'POST' && pathname === '/runs') {
      const body = await readBody(req);
      const { agent_name, input } = JSON.parse(body);
      const runId = randomUUID();

      const prompt = input ? acpMessagesToPrompt(input) : '';

      // Create the run
      createRun(runId, agent_name ?? 'clew-code', input);

      // Execute in background via codex process peer
      executeRunAsync(runId, prompt);

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          run_id: runId,
          agent_name: 'clew-code',
          status: 'running',
          output: null,
          error: null,
        }),
      );
      return;
    }

    // GET /runs/:id — check run status
    if (method === 'GET' && /^\/runs\/[^/]+$/.test(pathname) && params.id) {
      const run = getRun(params.id);
      if (!run) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Run not found' }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          run_id: run.id,
          agent_name: run.agentName,
          session_id: null,
          status: run.status,
          await_request: null,
          output: run.output,
          error: run.error,
        }),
      );
      return;
    }

    // DELETE /runs/:id — cancel a run
    if (method === 'DELETE' && /^\/runs\/[^/]+$/.test(pathname) && params.id) {
      cancelRun(params.id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'cancelled' }));
      return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logForDebugging(`[ACP-REST] Error: ${message}`);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: message }));
  }
}

/**
 * Execute a run in the background using the codex process peer.
 */
async function executeRunAsync(runId: string, prompt: string): Promise<void> {
  try {
    const provider = getProcessSwarmProvider('codex');
    if (!provider) {
      // Fallback: just complete with a message
      const { completeRun } = await import('./ACPRunManager.js');
      completeRun(runId, [resultToACPMessage(`No Codex provider available. Run "${prompt}"`)]);

      // Also update via ACPRunManager
      const { failRun } = await import('./ACPRunManager.js');
      failRun(runId, 'Codex provider not available. Install Codex CLI to execute tasks.');
      return;
    }

    const result = await provider.runTask({
      prompt,
      timeoutMs: 120_000,
    });

    const { completeRun, failRun } = await import('./ACPRunManager.js');
    if (result.exitCode === 0 && !result.timedOut) {
      const output = [resultToACPMessage(result.stdout || '(completed with no output)')];
      completeRun(runId, output);
    } else {
      const errorMsg = result.timedOut ? 'Task timed out' : result.stderr || `Exit code ${result.exitCode}`;
      failRun(runId, errorMsg);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const { failRun } = await import('./ACPRunManager.js');
    failRun(runId, message);
  }
}

/**
 * Read the full request body as a string.
 */
function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}
