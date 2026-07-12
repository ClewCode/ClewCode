/** PeerDiscoverTool — discover peers on the LAN */

export const PEER_DISCOVER_TOOL_NAME = 'peer_discover';

export const DESCRIPTION =
  'Discover Clew Code peers on the local network. ' +
  'Scans the LAN for other instances running `/peer share` and returns ' +
  'a list of peers with their hostname, IP, port, working directory, and shell. ' +
  'Supports waiting: set `wait: true` and `minPeers` to wait for enough peers. ' +
  'Use this to find available peers before assigning tasks.';

export const PROMPT =
  'This tool scans the local network for other Clew Code instances that are ' +
  'advertising themselves (via `/peer share`). It returns a list of discovered ' +
  'peers with their hostname, IP address, port, current working directory, ' +
  'and shell type. Peers on the same machine are discovered via a shared ' +
  'file registry, while remote peers are found via UDP multicast on the LAN.\n\n' +
  'For waiting, use `wait: true` with `minPeers` and `waitTimeout`. ' +
  'The tool will re-discover every few seconds until enough peers appear.\n\n' +
  'Run this first to find available peers, then use peer_send_message or peer_broadcast to assign tasks.';
