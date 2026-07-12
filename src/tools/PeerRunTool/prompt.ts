/** PeerRunTool — run a shell command on a peer node */

export const PEER_RUN_TOOL_NAME = 'peer_run';

export const DESCRIPTION =
  'Run a shell command on a remote peer node and get the output back. ' +
  'The peer must be sharing (via peer_share start) and reachable on the LAN. ' +
  'Use peer_discover first to find peers. ' +
  'The command is executed on the peer machine and stdout/stderr are returned.';

export const PROMPT =
  'Executes a shell command on a remote peer node via its HTTP API. ' +
  "The peer's PeerServer runs the command with the default shell (bash on Linux/macOS, " +
  'cmd/powershell on Windows) and returns stdout, stderr, and exit code. ' +
  'Only works for peers that are currently sharing on the same LAN. ' +
  'Use peer_discover to find available peers first.';
