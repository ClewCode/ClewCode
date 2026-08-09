/**
 * PeerExec — merges peer_run (one peer) and peer_swarm (all peers).
 *
 * The two were separate tools whose descriptions differed mainly in the word
 * "all". Presence or absence of `peer` is a clearer signal to the model than
 * two names one letter apart in meaning, and it removes a whole tool
 * description from every session's prompt.
 *
 * Like PeerManage this is a facade: the underlying tools keep their
 * implementations and renderers.
 */
import { z } from 'zod/v4';
import { buildTool, type ToolDef, type ToolUseContext } from '../../Tool.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { PeerRunTool } from '../PeerRunTool/PeerRunTool.js';
import { PeerSwarmTool } from '../PeerSwarmTool/PeerSwarmTool.js';
import { DESCRIPTION, PEER_EXEC_TOOL_NAME, PROMPT } from './prompt.js';

const inputSchema = lazySchema(() =>
  z.object({
    command: z.string().min(1).describe('Shell command to execute.'),
    peer: z
      .string()
      .optional()
      .describe('Target peer (hostname, peer ID, name, or port). Omit to run on every connected peer in parallel.'),
    filter: z
      .string()
      .optional()
      .describe('Fan-out only: run only on peers whose hostname or role contains this string.'),
    timeout: z
      .number()
      .optional()
      .describe('Seconds before giving up (single: default 30/max 120; fan-out: default 60/max 300).'),
    priority: z
      .enum(['low', 'normal', 'high'])
      .optional()
      .describe('Single-peer only: "high" skips the peer\'s task queue.'),
    dependsOn: z
      .array(z.string())
      .optional()
      .describe('Single-peer only: task IDs from earlier peer_exec calls on the SAME peer that must finish first.'),
  }),
);
type InputSchema = ReturnType<typeof inputSchema>;
export type PeerExecInput = z.infer<InputSchema>;

const outputSchema = lazySchema(() =>
  z.object({
    mode: z.enum(['single', 'fanout']),
    result: z.string(),
    ok: z.boolean(),
  }),
);
type OutputSchema = ReturnType<typeof outputSchema>;
export type PeerExecOutput = z.infer<OutputSchema>;

type Delegate = {
  call: (input: never, context: never) => unknown;
  mapToolResultToToolResultBlockParam?: (output: never, toolUseID: string) => { content?: unknown };
};

/**
 * Fan out when no specific peer was named. Takes a partial because the UI
 * callbacks (getToolUseSummary/getActivityDescription) run against
 * not-yet-validated input.
 */
export function isFanout(input: Pick<Partial<PeerExecInput>, 'peer'>): boolean {
  return input.peer === undefined || input.peer === '';
}

export function buildDelegateCall(input: PeerExecInput): { tool: Delegate; args: Record<string, unknown> } {
  if (isFanout(input)) {
    return {
      tool: PeerSwarmTool as unknown as Delegate,
      args: { command: input.command, filter: input.filter, timeout: input.timeout ?? 60 },
    };
  }
  return {
    tool: PeerRunTool as unknown as Delegate,
    args: {
      worker: input.peer,
      command: input.command,
      timeout: input.timeout ?? 30,
      priority: input.priority ?? 'normal',
      dependsOn: input.dependsOn,
    },
  };
}

function renderDelegateResult(tool: Delegate, data: unknown): string {
  const rendered = tool.mapToolResultToToolResultBlockParam?.(data as never, 'peer_exec');
  const content = rendered?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map(block => (typeof block === 'string' ? block : ((block as { text?: string }).text ?? JSON.stringify(block))))
      .join('\n');
  }
  return typeof data === 'string' ? data : JSON.stringify(data, null, 2);
}

export const PeerExecTool = buildTool({
  name: PEER_EXEC_TOOL_NAME,
  searchHint: 'run a shell command on one peer or all peers',
  maxResultSizeChars: 200_000,
  async description() {
    return DESCRIPTION;
  },
  async prompt() {
    return PROMPT;
  },
  userFacingName() {
    return 'PeerExec';
  },
  getToolUseSummary(input) {
    if (!input) return '';
    return isFanout(input) ? `all: ${input.command}` : `${input.peer}: ${input.command}`;
  },
  getActivityDescription(input) {
    if (!input) return 'Running on peers';
    return isFanout(input) ? 'Running on all peers' : `Running on ${input.peer}`;
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
  toAutoClassifierInput(input) {
    return input.command;
  },
  async checkPermissions() {
    return { behavior: 'allow' as const, updatedInput: {} };
  },
  async call(input, context) {
    const mode = isFanout(input) ? ('fanout' as const) : ('single' as const);
    const { tool, args } = buildDelegateCall(input);
    try {
      const raw = await (tool.call as (a: unknown, c: unknown) => unknown)(args, context as ToolUseContext);
      const data = raw && typeof raw === 'object' && 'data' in raw ? (raw as { data: unknown }).data : raw;
      return { data: { mode, ok: true, result: renderDelegateResult(tool, data) } };
    } catch (err) {
      return {
        data: { mode, ok: false, result: `peer_exec failed: ${err instanceof Error ? err.message : String(err)}` },
      };
    }
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    return { tool_use_id: toolUseID, type: 'tool_result', content: output.result };
  },
} satisfies ToolDef<InputSchema, PeerExecOutput>);
