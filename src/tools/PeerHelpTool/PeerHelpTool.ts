import { z } from 'zod/v4';
import { buildTool } from '../../Tool.js';
import { getCwd } from '../../utils/cwd.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { DESCRIPTION, PEER_HELP_TOOL_NAME } from './prompt.js';

const inputSchema = lazySchema(() =>
  z.object({
    topic: z
      .enum([
        'overview',
        'discovery',
        'messaging',
        'request-response',
        'chunking',
        'waiting',
        'broadcast',
        'exec',
        'admin',
        'mistakes',
      ])
      .optional()
      .default('overview')
      .describe(
        'Topic to show help for. ' +
          '"overview" shows everything. ' +
          'Use a specific topic when you need focused guidance on one area.',
      ),
  }),
);

const outputSchema = lazySchema(() =>
  z.object({
    content: z.string(),
    topic: z.string(),
  }),
);

function topic(text: string): string {
  return text;
}

const TOPICS: Record<string, string> = {
  overview: topic(`# PEER-TO-PEER COMPLETE FLOW GUIDE

## Quick Start
1. peer_manage({ action: "share", value: "start" })  — start advertising yourself
2. peer_discover({ wait: true, minPeers: 1 })        — find peers on the LAN
3. peer_manage({ action: "list" })                   — who is up, busy, and what they do
4. peer_send_message({ peer, message, waitResponse: true }) — send + wait for a reply
5. New peer replies arrive as <system-reminder> automatically — NO POLLING!

## Tools
  peer_manage        — admin: share, join/disconnect, ping, info, list, name/role, spawn, memory_sync
  peer_discover      — find peers on the LAN (wait: true, minPeers)
  peer_send_message  — one peer; waitResponse, chunk, broker modes
  peer_list_messages — read message history (new messages arrive automatically)
  peer_broadcast     — same AI task to ALL connected peers at once
  peer_exec          — shell commands on one peer or fan-out to all
  peer_help          — this guide

## Main flows
  discovery — find peers: share → discover → list/info/ping
  messaging — send/receive messages (automatic delivery)
  request-response — ask in ONE call (waitResponse) — recommended
  chunking  — send long content (research reports, code)
  waiting   — get results event-driven (never poll)
  broadcast — same AI task to everyone
  exec      — shell commands, priority, sequencing (dependsOn)
  admin     — names, roles, share/join, spawn, memory_sync
  mistakes  — pitfalls and how to avoid them`),
  discovery: topic(`# Peer Discovery

peer_manage({ action: "share", value: "start" }) → peer_discover → peer_manage list/info/ping

1. Start advertising first — peers can't find you until you share:
   - peer_manage({ action: "share", value: "start" }) — start; returns your port
   - peer_manage({ action: "share" }) — current status
   - peer_manage({ action: "share", value: "stop" }) — stop

2. Find peers:
   - peer_discover() — one scan
   - peer_discover({ wait: true, minPeers: 1 }) — wait until at least one appears
   - peer_discover({ minPeers: 3, waitTimeout: 60 }) — wait for 3 peers, up to 60s

3. Inspect:
   - peer_manage({ action: "info", peer: "hostname" }) — details of one peer
   - peer_manage({ action: "list", wait: true, minPeers: 1 }) — names, roles, busy/queue status
   - peer_manage({ action: "ping", peer: "hostname" }) — is it alive

A peer can be reached by hostname, peer ID, or port number.`),
  messaging: topic(`# Peer messaging

peer_send_message({ peer: "hostname", message: "hello" })
  → the peer sees it instantly; it is auto-injected into their AI prompt.

peer_list_messages(...) is for history only. New messages arrive automatically
as <system-reminder> — you do NOT need to poll or wait for them.

Long payloads: { ..., chunk: true, chunkSize: 1000 } — split, then reassembled
automatically on the receiver side (see peer_help chunking).

Durability: { ..., useBroker: true } — queued in the peer's broker store, good
when the receiver may be offline or you want durability.`),
  'request-response': topic(`# Request-response (recommended)

Best practice — one blocking call, no polling:
  peer_send_message({
    peer: "agent-b",
    message: "research X in 4 areas...",
    waitResponse: true,        // wait instead of send-then-poll
    responseTimeout: 300       // up to 5 minutes
  })
  → the reply arrives in response.text.

Anti-pattern (20+ tool calls):
  send → list(empty) → list(empty) → list(truncated) → "anyone?" → ...

Mention who you are, so the peer can reply to the right port:
  "I am {your_name} (port {your_port}). Do X. Reply back to me."`),
  chunking: topic(`# Chunking & heavy payloads

Long content gets truncated. Use chunk:
  peer_send({ peer: "agent-b", message: "REPORT_5000_CHARS...", chunk: true, chunkSize: 1000 })
  → sent as N chunks; receiver reassembles into one message (peer_list_messages shows it whole).

chunk + waitResponse together is supported and convenient.

## Broker delivery
  peer_send({ peer, message, useBroker: true, waitResponse: true })
  → message queued in the receiver's broker store; reply polled from /broker/recv.
  Use broker mode when the peer may be offline or for delivered-durable tasks.`),
  waiting: topic(`# Waiting for answers — event-driven

Peer replies arrive ASYSTEM-REMINDER automatically.

Right: use peer_manage info list with wait variants when you block on roster state.
For a reply, prefer ONE peer_send with waitResponse: true.

A 10+ round polling loop (peer_list_messages every second) is the classic footgun
— every round is latency and context wasted. Let events drive you.`),
  broadcast: topic(`# Broadcast — same task to every peer

  peer_broadcast({ task: "survey topic X, report findings" })
  → returns which peers accepted and which failed.

peer_broadcast delivers an AI prompt each peer executes with its own model.
For shell instead use peer_exec.

Confirm your audience before broadcasting:
  peer_manage({ action: "list" })   // roster: hostname, role, busy/queue`),
  exec: topic(`# peer_exec — run shell commands on peers

  one peer:    peer_exec({ peer: "builder-01", command: "bun test" })
  fan-out:     peer_exec({ command: "git pull" })        // every connected peer
  filtered:    peer_exec({ command: "git pull", filter: "builder" }) // hostname or role contains

Single-peer mode also supports:
  · priority: "high" — skips the peer's task queue and runs now
  · dependsOn: array of task IDs from earlier peer_exec on the SAME peer
    → queues this command to start after those report "completed" (build after install)

Runs SHELL, not prompts — for an AI task use peer_broadcast.
Call peer_manage({ action: "list" }) first when unsure who'll receive a fan-out.`),
  admin: topic(`# Identity & administration (peer_manage)

peer_manage is the single admin surface. Actions:

  share        start/stop/status your own advertising (value: "start" | "stop" | "status")
  join         connect to a peer persistently — host/port
  disconnect   drop a connection
  ping         is a peer alive (wait: true to block)
  info         details for one peer
  list         the roster — "what are my peers doing" (wait/timeout/minPeers)
  set_name     friendly name for a peer
  set_role     role for a peer (builder, tester, deployer, ...)
  spawn        start a new peer instance
  memory_sync  sync memory across the mesh (peer required)

Name and classify yourself too — peers that know each other obraçam better:
  peer_manage({ action: "set_name", peer: "<your-own-id>", value: "clew-main" })
  peer_manage({ action: "set_role", peer: "<your-own-id>", value: "orchestrator" })

Typical opening: share("start") → peer_discover → list.`),
  mistakes: topic(`# Common mistakes & avoidance

1.  Sending before discovering → always peer_discover first (or peer_manage join).
2.  Polling peer_list_messages in a loop → messages auto-arrive; use waitResponse instead.
3.  Missing your own name when sending to a spawned peer → "I am {name} (port {port})".
4.  No share → peers won't find you; check peer_manage share status first.
5.  Long message truncated → chunk: true.
6.  Confusing exec and broadcast → peer_broadcast = AI prompt; peer_exec = shell.
7.  Fan-out to everyone but you only meant one → pass peer to peer_exec or list first.
8.  Skipping sequencing → single-peer peer_exec supports dependsOn, priority instead of wait/retry.`),
};

export const PeerHelpTool = buildTool({
  isConcurrencySafe() {
    return true;
  },
  isReadOnly() {
    return true;
  },
  name: PEER_HELP_TOOL_NAME,
  searchHint: 'agent-to-agent tool usage guide',
  maxResultSizeChars: 20_000,
  async description() {
    return DESCRIPTION;
  },
  async prompt() {
    return DESCRIPTION;
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
  renderToolUseMessage(input) {
    return `show peer help: ${input.topic ?? 'overview'}`;
  },
  renderToolResultMessage(output) {
    return `Peer help: ${output.topic}`;
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: `${output.content.slice(0, 500)}\n\n(See full output for complete guide)`,
    };
  },
  async call(input: { topic?: string }) {
    const topic = input.topic ?? 'overview';
    const content = TOPICS[topic] ?? TOPICS.overview!;
    return {
      data: { content, topic },
    };
  },
});
