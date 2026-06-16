export const PEER_JOIN_TOOL_NAME = 'peer_join';

export const DESCRIPTION =
  'Connect to a peer node by host and port. Fetches the peer node info (hostname, name, role, shell, cwd) ' +
  'and adds them to your peer list. After joining, you can send tasks and run commands on this peer. ' +
  'Use peer_discover first to find available peers and their join addresses.';

export const PROMPT =
  'Connects to a remote peer by making an HTTP request to their peer-info endpoint. ' +
  'The peer must be sharing (via peer_share) and reachable on the network. ' +
  'After joining, the peer node appears in the peer list with their name, role, and other info. ' +
  'Use peer_discover to find peers to join.';
