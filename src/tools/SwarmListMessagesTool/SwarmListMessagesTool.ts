import { z } from 'zod/v4';
import { getGlobalSwarmStore } from '../../swarm/SwarmStore.js';
import type { SwarmChatMessage } from '../../swarm/types.js';
import { buildTool } from '../../Tool.js';
import { getCwd } from '../../utils/cwd.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { notifySwarmFeedback, truncateText } from '../swarm/swarmFeedback.js';
import { DESCRIPTION, SWARM_LIST_MESSAGES_TOOL_NAME, PROMPT } from './prompt.js';

const inputSchema = lazySchema(() =>
  z.object({
    after: z
      .number()
      .optional()
      .describe('Only return messages after this timestamp (epoch ms). Use to get only new messages since last check.'),
    wait: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        'If true and no new messages since `after`, wait up to `timeout` seconds for a message to arrive. Use this instead of polling in a loop.',
      ),
    timeout: z
      .number()
      .optional()
      .default(30)
      .describe('Max seconds to wait when `wait` is true (default: 30, max: 120).'),
    from: z
      .string()
      .optional()
      .describe(
        'Only return messages from this peer (hostname, peer ID, or port). When used with `wait`, only waits for messages from this sender.',
      ),
    trackPeer: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        'When `wait` is true and `from` is set: periodically checks peer liveness via /swarm-info. ' +
          'If the peer goes offline, returns early instead of waiting the full timeout. ' +
          'Use to avoid dead-waiting when a peer disappears.',
      ),
    maxTotalWait: z
      .number()
      .optional()
      .default(600)
      .describe(
        'Absolute max total seconds to wait when `trackPeer` is true (default: 600 = 10 minutes). Prevents indefinite hang.',
      ),
  }),
);

const outputSchema = lazySchema(() =>
  z.object({
    messages: z.array(
      z.object({
        from: z.string(),
        fromName: z.string(),
        text: z.string(),
        timestamp: z.number(),
        senderRole: z.string().optional(),
        senderPort: z.number().optional(),
      }),
    ),
    count: z.number(),
    waited: z.boolean().optional().describe('Whether the tool waited for new messages'),
    timedOut: z.boolean().optional().describe('Whether the wait timed out with no new messages'),
    swarmStatus: z
      .enum(['online', 'offline', 'unknown'])
      .optional()
      .describe(
        'Liveness status of the tracked peer at return time. ' +
          'online = peer was reachable, offline = peer was unreachable, unknown = no peer tracking.',
      ),
  }),
);

export type Output = z.infer<ReturnType<typeof outputSchema>>;

export const SwarmListMessagesTool = buildTool({
  isConcurrencySafe() {
    return true;
  },
  isReadOnly() {
    return true;
  },
  name: SWARM_LIST_MESSAGES_TOOL_NAME,
  searchHint: 'list peer messages',
  maxResultSizeChars: 50_000,
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
    if (!output.messages || output.messages.length === 0) {
      let content = 'No messages.';
      if (output.waited && output.timedOut) {
        if (output.swarmStatus === 'offline') content = 'Peer went offline while waiting — no messages received.';
        else content = 'Waited but no new messages arrived before timeout.';
      } else if (output.waited) {
        content = 'No new messages yet.';
      }
      return { tool_use_id: toolUseID, type: 'tool_result', content };
    }
    let prefix = `✓ ${output.count} new msg(s)`;
    if (output.waited)
      prefix = output.timedOut ? `⌛ ${output.count} msg(s) (timed out)` : `⬇ ${output.count} msg(s) (new)`;
    if (output.swarmStatus === 'offline') prefix += ' [peer offline]';
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content:
        `${prefix}: ` +
        output.messages
          .map((m: any) => {
            const tag = m.senderRole ? `[${m.senderRole}]` : '';
            return `${m.fromName}${tag}: ${truncateText(m.text || '', 200)}`;
          })
          .join(' | '),
    };
  },
  async call(input: {
    after?: number;
    wait?: boolean;
    timeout?: number;
    from?: string;
    trackPeer?: boolean;
    maxTotalWait?: number;
  }) {
    const store = getGlobalSwarmStore();
    const after = input.after ?? 0;

    notifySwarmFeedback(
      input.wait
        ? `waiting up to ${Math.min(Math.max(1, input.timeout ?? 30), 120)}s for new messages`
        : 'listing peer messages',
      'peer-list-msgs',
      'low',
    );

    // If `from` is set, filter messages by sender
    const filterByFrom = (msgs: SwarmChatMessage[]) =>
      input.from ? msgs.filter(m => m.from === input.from || m.fromName === input.from) : msgs;

    let messages = filterByFrom(store.getReassembledMessagesAfter(after));

    let waited = false;
    let timedOut = false;
    let swarmStatus: 'online' | 'offline' | 'unknown' | undefined;

    if (input.wait && messages.length === 0) {
      waited = true;
      const cycleTimeoutMs = Math.min(Math.max(1, input.timeout ?? 30), 120) * 1000;
      const maxTotalMs = Math.min(Math.max(1, input.maxTotalWait ?? 600), 3600) * 1000;
      const deadline = Date.now() + maxTotalMs;
      const trackPeer = input.trackPeer && input.from;

      while (Date.now() < deadline) {
        const remaining = deadline - Date.now();
        const waitMs = Math.min(cycleTimeoutMs, remaining);

        const raw = input.from
          ? await store.waitForMessageFrom(after, waitMs, input.from)
          : await store.waitForNewMessage(after, waitMs);

        messages = filterByFrom(store.getReassembledMessagesAfter(after));
        if (messages.length > 0) {
          swarmStatus = 'online';
          break;
        }

        // If tracking peer liveness, check if the peer is still reachable
        if (trackPeer) {
          const alive = await this.pingPeer(input.from!);
          if (!alive) {
            swarmStatus = 'offline';
            timedOut = true;
            break;
          }
          // Peer is still alive — keep waiting (loop continues)
          swarmStatus = 'online';
        } else {
          // No tracking — one cycle only, then give up
          break;
        }
      }

      if (messages.length === 0 && !timedOut) {
        timedOut = true;
      }
    }

    const dataMessages = messages.map(m => ({
      from: m.from,
      fromName: m.fromName,
      text: m.text,
      timestamp: m.timestamp,
      senderRole: m.senderRole,
      senderPort: m.senderPort,
    }));
    notifySwarmFeedback(
      dataMessages.length > 0 ? `found ${dataMessages.length} message(s)` : 'no new messages',
      'peer-list-msgs-result',
      dataMessages.length > 0 ? 'medium' : 'low',
    );
    return {
      data: {
        messages: dataMessages,
        count: dataMessages.length,
        waited,
        timedOut,
        swarmStatus: swarmStatus ?? (input.trackPeer ? 'unknown' : undefined),
      },
    };
  },

  /** Ping a peer by hostname/ID/port — returns true if reachable via /swarm-info */
  async pingPeer(query: string): Promise<boolean> {
    const store = getGlobalSwarmStore();
    try {
      let peer = store.findPeer(query);
      const portNum = parseInt(query, 10);
      if (!peer && !isNaN(portNum)) peer = store.getPeerByPort(portNum);
      if (!peer) return false;

      const url = `http://${peer.ip || '127.0.0.1'}:${swarm.port}/swarm-info`;
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      return response.ok;
    } catch {
      return false;
    }
  },
});
