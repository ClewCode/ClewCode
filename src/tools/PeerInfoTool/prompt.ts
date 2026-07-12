/** PeerInfoTool — get detailed info about a specific peer */

export const PEER_INFO_TOOL_NAME = 'peer_info';

export const DESCRIPTION =
  'Get detailed information about a specific peer by hostname or ID. ' +
  'Returns their IP, port, working directory, shell, platform, and current status. ' +
  'Supports waiting: set `wait: true` to retry until the peer appears. ' +
  'Use peer_discover first to find peers and their IDs.';

export const PROMPT =
  'Fetches detailed information about a peer node from the local peer store, ' +
  'or directly from the peer node via HTTP if not cached. Returns hostname, IP, port, ' +
  'current working directory, shell type, platform, and online status.\n\n' +
  'Use `wait: true` with `timeout` to wait for a peer to appear, instead of polling.';
