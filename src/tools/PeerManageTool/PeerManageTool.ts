/**
 * PeerManage — one administrative entry point for the peer surface.
 *
 * The peer feature shipped 18 top-level tools, every one of them always
 * enabled, so every session paid for 18 tool descriptions in the system prompt
 * whether or not it ever touched a peer. Eleven of those were single-verb
 * admin calls (`peer_ping`, `peer_set_role`, `peer_share`, …) that differ only
 * in which one or two fields they take.
 *
 * This tool folds those eleven into one `action` dispatch. It is deliberately
 * a facade: each underlying tool keeps its own implementation, schema
 * validation and result rendering, and is still reachable in code — only the
 * model-facing surface collapses. That keeps the change reversible and means
 * no peer behavior is re-implemented (and so none can drift).
 *
 * Left as separate tools: peer_discover, peer_send_message, peer_list_messages,
 * peer_broadcast, peer_exec and peer_help. Those carry real schemas of their
 * own and are the hot path — merging them would trade a smaller tool list for
 * a mega-schema the model gets wrong.
 */
import { z } from 'zod/v4';
import { buildTool, type ToolDef, type ToolUseContext } from '../../Tool.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { PeerDisconnectTool } from '../PeerDisconnectTool/PeerDisconnectTool.js';
import { PeerInfoTool } from '../PeerInfoTool/PeerInfoTool.js';
import { PeerJoinTool } from '../PeerJoinTool/PeerJoinTool.js';
import { PeerListRolesTool } from '../PeerListRolesTool/PeerListRolesTool.js';
import { PeerMemorySyncTool } from '../PeerMemorySyncTool/PeerMemorySyncTool.js';
import { PeerPingTool } from '../PeerPingTool/PeerPingTool.js';
import { PeerSetNameTool } from '../PeerSetNameTool/PeerSetNameTool.js';
import { PeerSetRoleTool } from '../PeerSetRoleTool/PeerSetRoleTool.js';
import { PeerShareTool } from '../PeerShareTool/PeerShareTool.js';
import { PeerSpawnTool } from '../PeerSpawnTool/PeerSpawnTool.js';
import { DESCRIPTION, PEER_MANAGE_TOOL_NAME, PROMPT } from './prompt.js';

export const PEER_MANAGE_ACTIONS = [
  'share',
  'join',
  'disconnect',
  'ping',
  'info',
  'list',
  'set_name',
  'set_role',
  'spawn',
  'memory_sync',
] as const;
export type PeerManageAction = (typeof PEER_MANAGE_ACTIONS)[number];

const inputSchema = lazySchema(() =>
  z.object({
    action: z.enum(PEER_MANAGE_ACTIONS).describe('Which peer operation to perform. See the tool prompt for each.'),
    peer: z
      .string()
      .optional()
      .describe(
        'Target peer — hostname, peer ID, display name, or port. Required by disconnect/ping/info/set_*/memory_sync.',
      ),
    value: z
      .string()
      .optional()
      .describe(
        'The action\'s argument: share → "start"|"stop"|"status"; set_name → the new name; set_role → the role; spawn → optional name.',
      ),
    host: z.string().optional().describe('join: hostname or IP (default 127.0.0.1).'),
    port: z.number().optional().describe('join: port of the peer to connect to. Required for join.'),
    role: z.string().optional().describe('spawn: role for the new peer instance.'),
    prompt: z.string().optional().describe('spawn: custom system prompt for the new peer session.'),
    wait: z
      .boolean()
      .optional()
      .describe(
        'ping/info/list: block until the peer appears instead of returning immediately. Use this rather than polling.',
      ),
    timeout: z
      .number()
      .optional()
      .describe('ping/info/list: max seconds to wait when `wait` is true (default 30, max 120).'),
    minPeers: z.number().optional().describe('list: how many peers to wait for when `wait` is true (default 1).'),
    limit: z.number().optional().describe('memory_sync: max memories to fetch (default 50, max 200).'),
  }),
);
type InputSchema = ReturnType<typeof inputSchema>;
export type PeerManageInput = z.infer<InputSchema>;

const outputSchema = lazySchema(() =>
  z.object({
    action: z.string(),
    /** Rendered text from the underlying tool, or an error explaining what was missing. */
    result: z.string(),
    ok: z.boolean(),
  }),
);
type OutputSchema = ReturnType<typeof outputSchema>;
export type PeerManageOutput = z.infer<OutputSchema>;

/** Minimal shape the facade needs from a delegated tool. */
type Delegate = {
  call: (input: never, context: never) => unknown;
  validateInput?: (input: never, context: never) => Promise<{ result: true } | { result: false; message: string }>;
  mapToolResultToToolResultBlockParam?: (output: never, toolUseID: string) => { content?: unknown };
};

/**
 * Which fields each action needs. Checked before dispatch so a missing field
 * comes back as a usable message instead of an exception from deep inside the
 * underlying tool.
 */
export const REQUIRED_FIELDS: Record<PeerManageAction, readonly (keyof PeerManageInput)[]> = {
  share: [],
  join: ['port'],
  disconnect: ['peer'],
  ping: ['peer'],
  info: ['peer'],
  list: [],
  set_name: ['peer', 'value'],
  set_role: ['peer', 'value'],
  spawn: [],
  memory_sync: ['peer'],
};

export function missingFieldsFor(input: PeerManageInput): string[] {
  const required = REQUIRED_FIELDS[input.action];
  return required ? required.filter(field => input[field] === undefined || input[field] === '') : ['action'];
}

/** Map the flat facade input onto the underlying tool's own input shape. */
export function buildDelegateCall(input: PeerManageInput): { tool: Delegate; args: Record<string, unknown> } {
  switch (input.action) {
    case 'share':
      return { tool: PeerShareTool as unknown as Delegate, args: { action: input.value ?? 'status' } };
    case 'join':
      return { tool: PeerJoinTool as unknown as Delegate, args: { host: input.host ?? '127.0.0.1', port: input.port } };
    case 'disconnect':
      return { tool: PeerDisconnectTool as unknown as Delegate, args: { peer: input.peer } };
    case 'ping':
      return {
        tool: PeerPingTool as unknown as Delegate,
        args: { peer: input.peer, wait: input.wait, timeout: input.timeout },
      };
    case 'info':
      // PeerInfoTool names its target `worker`, not `peer`.
      return {
        tool: PeerInfoTool as unknown as Delegate,
        args: { worker: input.peer, wait: input.wait, timeout: input.timeout },
      };
    case 'list':
      // `list` absorbed the old `dashboard` action: the roster and the
      // per-peer task view answer the same question ("what are my peers
      // doing"), and offering both made the model pick between two tools that
      // overlapped almost completely. The task lines are appended in call().
      return {
        tool: PeerListRolesTool as unknown as Delegate,
        args: { wait: input.wait, timeout: input.timeout, minPeers: input.minPeers },
      };
    case 'set_name':
      return { tool: PeerSetNameTool as unknown as Delegate, args: { worker: input.peer, name: input.value } };
    case 'set_role':
      return { tool: PeerSetRoleTool as unknown as Delegate, args: { worker: input.peer, role: input.value } };
    case 'spawn':
      return {
        tool: PeerSpawnTool as unknown as Delegate,
        args: { name: input.value, role: input.role, prompt: input.prompt },
      };
    case 'memory_sync':
      return { tool: PeerMemorySyncTool as unknown as Delegate, args: { peer: input.peer, limit: input.limit } };
  }
}

/**
 * Render a delegate's structured output the way that delegate would have.
 * Falls back to JSON when the underlying tool has no renderer, so a new peer
 * tool wired in here still produces something readable.
 */
function renderDelegateResult(tool: Delegate, data: unknown): string {
  const rendered = tool.mapToolResultToToolResultBlockParam?.(data as never, 'peer_manage');
  const content = rendered?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map(block => (typeof block === 'string' ? block : ((block as { text?: string }).text ?? JSON.stringify(block))))
      .join('\n');
  }
  return typeof data === 'string' ? data : JSON.stringify(data, null, 2);
}

export const PeerManageTool = buildTool({
  name: PEER_MANAGE_TOOL_NAME,
  searchHint: 'manage peer connections, identity and roles',
  maxResultSizeChars: 100_000,
  async description() {
    return DESCRIPTION;
  },
  async prompt() {
    return PROMPT;
  },
  userFacingName() {
    return 'Peer';
  },
  getToolUseSummary(input) {
    return input?.peer ? `${input.action} ${input.peer}` : (input?.action ?? '');
  },
  getActivityDescription(input) {
    return input?.action ? `Peer ${input.action.replace('_', ' ')}` : 'Managing peers';
  },
  get inputSchema(): InputSchema {
    return inputSchema();
  },
  get outputSchema(): OutputSchema {
    return outputSchema();
  },
  isConcurrencySafe() {
    return false;
  },
  isReadOnly() {
    return false;
  },
  async checkPermissions() {
    return { behavior: 'allow' as const, updatedInput: {} };
  },
  async call(input, context) {
    const missing = missingFieldsFor(input);
    if (missing.length > 0) {
      return {
        data: {
          action: input.action,
          ok: false,
          result: `"${input.action}" needs: ${missing.join(', ')}. Nothing was done.`,
        },
      };
    }

    const { tool, args } = buildDelegateCall(input);
    try {
      const validation = await tool.validateInput?.(args as never, context as never);
      if (validation?.result === false) {
        return { data: { action: input.action, ok: false, result: validation.message } };
      }
      const raw = await (tool.call as (a: unknown, c: unknown) => unknown)(args, context as ToolUseContext);
      // Delegates return { data } like any tool; unwrap so the renderer sees
      // the same shape it would have received on a direct call.
      const data = raw && typeof raw === 'object' && 'data' in raw ? (raw as { data: unknown }).data : raw;
      let result = renderDelegateResult(tool, data);
      if (input.action === 'list') {
        // Empty string when no peer has any tasks — nothing to append then.
        const { formatPeerTaskDashboard } = await import('../../peer/peerDashboard.js');
        const tasks = formatPeerTaskDashboard();
        if (tasks)
          result = `${result}

${tasks}`;
      }
      return { data: { action: input.action, ok: true, result } };
    } catch (err) {
      return {
        data: {
          action: input.action,
          ok: false,
          result: `peer ${input.action} failed: ${err instanceof Error ? err.message : String(err)}`,
        },
      };
    }
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    return { tool_use_id: toolUseID, type: 'tool_result', content: output.result };
  },
} satisfies ToolDef<InputSchema, PeerManageOutput>);
