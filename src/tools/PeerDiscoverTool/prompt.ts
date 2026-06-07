/** PeerDiscoverTool — discover workers on the LAN */

export const PEER_DISCOVER_TOOL_NAME = 'peer_discover';

export const DESCRIPTION =
  'Discover Clew Code workers on the local network. ' +
  'Scans the LAN for other instances running `/peer share` and returns ' +
  'a list of workers with their hostname, IP, port, working directory, and shell. ' +
  'Also discovers workers on the same machine via a shared file registry. ' +
  'Use this to find available workers before assigning tasks with peer_send_task.';

export const PROMPT =
  'This tool scans the local network for other Clew Code instances that are ' +
  'advertising as workers (via `/peer share`). It returns a list of discovered ' +
  'workers with their hostname, IP address, port, current working directory, ' +
  'and shell type. Workers on the same machine are discovered via a shared ' +
  'file registry, while remote workers are found via UDP multicast on the LAN. ' +
  'Run this first to find available workers, then use peer_send_task to assign tasks.';
