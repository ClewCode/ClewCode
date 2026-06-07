/** PeerPingTool — check if a peer is online */

export const PEER_PING_TOOL_NAME = 'peer_ping';

export const DESCRIPTION =
  'Check if a specific peer is still online and reachable. ' +
  'Sends a GET request to the peer\'s /peer-info endpoint. ' +
  'Use this to verify connectivity before sending tasks or messages.';

export const PROMPT =
  'This tool pings a peer to check if they are online. ' +
  'It makes a GET request to /peer-info and returns the peer\'s status. ' +
  'The `peer` parameter accepts a hostname, peer ID, or port number. ' +
  'Use this to verify that a peer is reachable before sending tasks or messages.';
