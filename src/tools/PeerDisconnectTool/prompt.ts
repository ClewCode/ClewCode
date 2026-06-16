/** PeerDisconnectTool — remove a peer node from the connection list */

export const PEER_DISCONNECT_TOOL_NAME = 'peer_disconnect';

export const DESCRIPTION =
  'Disconnect and remove a peer node from the connection list. ' +
  'The peer will no longer appear in the peer list and cannot receive tasks.';

export const PROMPT =
  'This tool removes a peer node from the local connection list. ' +
  'Use this to clean up stale or unwanted connections. ' +
  'The `peer` parameter accepts a hostname, peer ID, or port number.';
