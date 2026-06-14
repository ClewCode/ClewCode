/**
 * ACP (Agent Communication Protocol) REST API Server.
 *
 * Exposes REST endpoints for external ACP/Mesh-compatible agents to:
 * - Discover Clew Code as an agent (GET /agents)
 * - Execute tasks (POST /runs)
 * - Check run status (GET /runs/:id)
 * - Stream run events (GET /runs/:id/stream)
 * - Cancel runs (DELETE /runs/:id)
 *
 * Spec: https://agentcommunicationprotocol.dev
 * SDK: acp-sdk (i-am-bee / Linux Foundation Mesh)
 */

import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { ACPRestConfig } from './ACPRestConfig.js';
import { createClewCodeManifest } from './ACPAgentManifest.js';
import { createRun, getRun, isTerminalStatus } from './ACPRunManager.js';
import type { ACPRunStatus } from './ACPRunManager.js';
import { textToACPMessage, acpMessagesToPrompt } from './ACPMessageConverter.js';
import { AcpRunController } from './AcpRunController.js';
import { logForDebugging } from '../utils/debug.js';

let server: ReturnType<typeof createServer> | null = null;
const runController = new AcpRunController();

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

      // Create the run entry
      createRun(runId, agent_name ?? 'clew-code', input);

      // Execute in background through AcpRunController (lifecycle owner)
      runController.execute(runId, prompt, { timeoutMs: 120_000 });

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

    // GET /runs/:id/stream — SSE streaming
    if (method === 'GET' && /^\/runs\/[^/]+\/stream$/.test(pathname) && params.id) {
      const run = getRun(params.id);
      if (!run) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Run not found' }));
        return;
      }
      handleStreamRun(res, params.id, run.status);
      return;
    }

    // DELETE /runs/:id — cancel a run
    if (method === 'DELETE' && /^\/runs\/[^/]+$/.test(pathname) && params.id) {
      const cancelled = runController.cancel(params.id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: cancelled ? 'cancelled' : 'not_found_or_terminal' }));
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
 * Handle SSE streaming for GET /runs/:id/stream.
 *
 * Polls the run status every 500ms, sending SSE events.
 * Sends keepalive comments every 15s to prevent proxy timeout.
 * Closes the stream when the run reaches a terminal state.
 */
function handleStreamRun(res: import('node:http').ServerResponse, runId: string, initialStatus: ACPRunStatus): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  // If already terminal, send one event and close
  if (isTerminalStatus(initialStatus)) {
    const run = getRun(runId);
    sendSSEEvent(res, { run_id: runId, status: run?.status ?? initialStatus, output: run?.output, error: run?.error });
    res.end();
    return;
  }

  // Send initial running event
  sendSSEEvent(res, { run_id: runId, status: 'running' });

  let lastKeepalive = Date.now();
  const keepaliveMsg = ':keepalive\n\n';
  const pollInterval = setInterval(() => {
    const now = Date.now();

    // Keepalive every 15s
    if (now - lastKeepalive >= 15_000) {
      res.write(keepaliveMsg);
      lastKeepalive = now;
    }

    const run = getRun(runId);
    if (!run) {
      sendSSEEvent(res, { run_id: runId, status: 'failed', error: 'Run not found' });
      clearInterval(pollInterval);
      res.end();
      return;
    }

    sendSSEEvent(res, { run_id: runId, status: run.status, output: run.output, error: run.error });

    if (isTerminalStatus(run.status)) {
      clearInterval(pollInterval);
      res.end();
    }
  }, 500);

  // Cleanup on client disconnect
  res.on('close', () => {
    clearInterval(pollInterval);
  });
}

function sendSSEEvent(
  res: import('node:http').ServerResponse,
  data: Record<string, unknown>,
): void {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
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
