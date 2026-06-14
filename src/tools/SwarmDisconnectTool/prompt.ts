/** SwarmDisconnectTool — remove a peer from the connection list */

export const SWARM_DISCONNECT_TOOL_NAME = 'swarm_disconnect';

export const DESCRIPTION =
  'Disconnect and remove a peer from the connection list. ' +
  'The peer will no longer appear in the peer list and cannot receive tasks.';

export const PROMPT =
  'This tool removes a peer from the local connection list. ' +
  'Use this to clean up stale or unwanted connections. ' +
  'The `peer` parameter accepts a hostname, peer ID, or port number.';
