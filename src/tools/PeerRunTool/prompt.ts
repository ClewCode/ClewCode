/** PeerRunTool — run a shell command on a worker peer */

export const PEER_RUN_TOOL_NAME = 'peer_run';

export const DESCRIPTION =
  'Run a shell command on a remote worker peer and get the output back. ' +
  'The worker must be sharing (via peer_share start) and reachable on the LAN. ' +
  'Use peer_discover first to find workers. ' +
  'The command is executed on the worker machine and stdout/stderr are returned.';

export const PROMPT =
  'Executes a shell command on a remote worker peer via its HTTP API. ' +
  "The worker's PeerServer runs the command with the default shell (bash on Linux/macOS, " +
  'cmd/powershell on Windows) and returns stdout, stderr, and exit code. ' +
  'Only works for workers that are currently sharing on the same LAN. ' +
  'Use peer_discover to find available workers first.';
