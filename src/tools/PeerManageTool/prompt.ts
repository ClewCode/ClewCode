export const PEER_MANAGE_TOOL_NAME = 'peer_manage';

export const DESCRIPTION =
  'Manage peer connections and identity: share, join, disconnect, ping, inspect, name/role, spawn, memory sync. ' +
  'One tool with an `action` — the messaging tools (peer_send_message, peer_list_messages, peer_broadcast) are separate.';

export const PROMPT = `Administrative operations on peers. Pick an \`action\`:

  share        — start/stop/check your own sharing. Pass \`value\`: "start" | "stop" | "status" (default "status").
                 You must share before other peers can find you.
  join         — connect to a peer persistently. Needs \`port\`, optionally \`host\` (default 127.0.0.1).
  disconnect   — drop a connection. Needs \`peer\`.
  ping         — check a peer is alive. Needs \`peer\`. \`wait: true\` retries until \`timeout\` instead of you polling.
  info         — details about one peer. Needs \`peer\`. Supports \`wait\`/\`timeout\`.
  list         — every known peer with name, role, health, and what each is working on.
                 Supports \`wait\`/\`timeout\`/\`minPeers\`. This is the "what are my peers doing" call.
  set_name     — rename a peer. Needs \`peer\` and \`value\`.
  set_role     — set a peer's role (builder, tester, deployer, …). Needs \`peer\` and \`value\`.
  spawn        — start a new peer instance.
  memory_sync  — sync memory with peers.

Typical opening sequence: \`share\` (value "start") → \`peer_discover\` → \`list\`.

Prefer \`wait: true\` over calling this in a loop: the wait variants block server-side and return as soon as the
condition is met, which costs one tool call instead of many.`;
