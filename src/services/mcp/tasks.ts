/**
 * Task-augmented tool calls (MCP spec revision 2025-11-25).
 *
 * A server may mark a tool `execution.taskSupport: 'optional' | 'required'`,
 * meaning `tools/call` returns a task handle immediately and the real result is
 * fetched later. `required` tools cannot be called the plain way at all — the
 * SDK's `client.callTool()` throws for them — so anything task-capable has to go
 * through `client.experimental.tasks.callToolStream()`.
 *
 * The SDK decides whether to augment a call by consulting a private cache that
 * only `client.listTools()` fills. This file bypasses that: `recordToolTaskSupport()`
 * remembers what the raw `tools/list` response said, and the call site passes
 * `task: {}` explicitly. That keeps the paginated tools/list loop in client.ts
 * (which does not use `client.listTools()`) working as the source of truth.
 */

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { CallToolResultSchema, McpError, type Tool } from '@modelcontextprotocol/sdk/types.js';
import { logMCPDebug } from '../../utils/log.js';

/**
 * What parsing a tool result through `CallToolResultSchema` actually produces.
 * Structurally narrower than the exported `CallToolResult` (nested `_meta` is
 * typed rather than `Record<string, unknown>`), and it is what both the plain
 * and the task-augmented call paths return — so it is the type the shared
 * result handling has to speak.
 */
export type CallToolResultOutput = ReturnType<typeof CallToolResultSchema.parse>;

export type ToolTaskSupport = 'optional' | 'required';

/** serverName → toolName → taskSupport, for tools that support tasks at all. */
const taskSupportByServer = new Map<string, Map<string, ToolTaskSupport>>();

/**
 * Records which of a server's tools are task-augmented. Call this with the raw
 * `tools/list` payload every time the list is (re)fetched — entries for tools
 * the server no longer reports are dropped.
 */
export function recordToolTaskSupport(serverName: string, tools: Tool[]): void {
  const supported = new Map<string, ToolTaskSupport>();
  for (const tool of tools) {
    const taskSupport = tool.execution?.taskSupport;
    if (taskSupport === 'optional' || taskSupport === 'required') {
      supported.set(tool.name, taskSupport);
    }
  }
  if (supported.size === 0) {
    taskSupportByServer.delete(serverName);
    return;
  }
  taskSupportByServer.set(serverName, supported);
  logMCPDebug(serverName, `Task-augmented tools: ${[...supported.keys()].join(', ')}`);
}

/** Forgets a server's task metadata — call on disconnect. */
export function clearToolTaskSupport(serverName: string): void {
  taskSupportByServer.delete(serverName);
}

/** `undefined` when the tool is unknown or declares `forbidden`/no task support. */
export function getToolTaskSupport(serverName: string, toolName: string): ToolTaskSupport | undefined {
  return taskSupportByServer.get(serverName)?.get(toolName);
}

export type TaskProgressUpdate = {
  taskId: string;
  status: string;
  statusMessage?: string;
  /** Server's hint, in ms, for how long to wait before the next poll. */
  pollInterval?: number;
};

/**
 * Runs a task-augmented `tools/call` to completion. The SDK drives the polling;
 * this only translates the stream into a single result plus progress callbacks.
 *
 * Deliberately has no wall-clock timeout of its own: a task exists precisely
 * because the work outlives a normal request, so the caller's `signal` is the
 * only way out.
 */
export async function callToolAsTask({
  client,
  serverName,
  toolName,
  args,
  meta,
  signal,
  onTaskUpdate,
}: {
  client: Client;
  serverName: string;
  toolName: string;
  args: Record<string, unknown>;
  meta?: Record<string, unknown>;
  signal: AbortSignal;
  onTaskUpdate?: (update: TaskProgressUpdate) => void;
}): Promise<CallToolResultOutput> {
  const stream = client.experimental.tasks.callToolStream(
    { name: toolName, arguments: args, _meta: meta },
    CallToolResultSchema,
    // An explicit `task` is what makes this a task call — without it the SDK
    // falls back to its own (empty) cache and sends a plain request, which a
    // `required` tool rejects.
    { signal, task: {} },
  );

  for await (const message of stream) {
    switch (message.type) {
      case 'taskCreated':
        logMCPDebug(serverName, `Tool '${toolName}' created task ${message.task.taskId}`);
        onTaskUpdate?.(toUpdate(message.task));
        break;
      case 'taskStatus':
        onTaskUpdate?.(toUpdate(message.task));
        break;
      case 'result':
        return message.result;
      case 'error':
        throw message.error;
    }
  }

  // callToolStream documents that it always ends with 'result' or 'error'.
  // Reaching here means the server closed the stream early.
  throw new McpError(-32603, `MCP server "${serverName}" ended task for tool "${toolName}" without a result`);
}

function toUpdate(task: { taskId: string; status: string; statusMessage?: string; pollInterval?: number }) {
  return {
    taskId: task.taskId,
    status: task.status,
    statusMessage: task.statusMessage,
    pollInterval: task.pollInterval,
  };
}
