export const PEER_EXEC_TOOL_NAME = 'peer_exec';

export const DESCRIPTION =
  'Run a shell command on one peer, or on every connected peer in parallel. ' +
  'Omit `peer` to fan out to all of them (optionally narrowed by `filter`).';

export const PROMPT = `Execute a shell command on peers and collect stdout, stderr and exit code.

  peer_exec({ peer: "builder-01", command: "bun test" })   → one peer
  peer_exec({ command: "git pull" })                       → every connected peer, in parallel
  peer_exec({ command: "git pull", filter: "builder" })    → only peers whose hostname or role matches

Single-peer mode also supports \`priority\` and \`dependsOn\`: pass task IDs returned by an earlier peer_exec on the
SAME peer to sequence dependent work (build after install) without polling for completion.

This runs shell commands, not prompts — to hand an AI task to peers use peer_broadcast instead.
Call peer_manage({ action: "list" }) first if you are unsure which peers will receive a fan-out.`;
