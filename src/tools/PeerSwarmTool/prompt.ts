/** PeerSwarmTool — run a command on ALL connected peers in parallel */

export const PEER_SWARM_TOOL_NAME = 'peer_swarm';

export const DESCRIPTION =
  'Run a shell command on ALL currently connected peers in parallel. ' +
  'Unlike peer_broadcast (which sends an AI prompt task), this executes ' +
  'the command via /peer-exec on every peer and collects the results. ' +
  'Results include stdout, stderr, and exit code from each peer. ' +
  'Use peer_list_roles first to confirm which peers will receive the command.';

export const PROMPT =
  'This tool sends the same shell command to every connected peer simultaneously ' +
  'and waits for all responses. It returns a summary of which peers succeeded or failed. ' +
  'The `command` parameter is a shell command to execute on each peer. ' +
  'Use peer_list_roles first to confirm which peers will receive the command. ' +
  'Use `filter` to target only peers whose hostname or role matches a pattern.';
