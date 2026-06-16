/** PeerDiscoverTool — discover workers on the LAN */

export const PEER_DISCOVER_TOOL_NAME = 'peer_discover';

export const DESCRIPTION =
  'Discover Clew Code workers on the local network. ' +
  'Scans the LAN for other instances running `/peer share` and returns ' +
  'a list of workers with their hostname, IP, port, working directory, and shell. ' +
  'Supports waiting: set `wait: true` and `minMeshs` to wait for enough workers. ' +
  'Use this to find available workers before assigning tasks.';

export const PROMPT =
  'This tool scans the local network for other Clew Code instances that are ' +
  'advertising as workers (via `/peer share`). It returns a list of discovered ' +
  'workers with their hostname, IP address, port, current working directory, ' +
  'and shell type. Workers on the same machine are discovered via a shared ' +
  'file registry, while remote workers are found via UDP multicast on the LAN.\n\n' +
  'For waiting, use `wait: true` with `minMeshs` and `waitTimeout`. ' +
  'The tool will re-discover every few seconds until enough peers appear.\n\n' +
  'Run this first to find available workers, then use mesh_send_task to assign tasks.';
