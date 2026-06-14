export const MESH_JOIN_TOOL_NAME = 'mesh_join';

export const DESCRIPTION =
  'Connect to a mesh node by host and port. Fetches the mesh node info (hostname, name, role, shell, cwd) ' +
  'and adds them to your mesh list. After joining, you can send tasks and run commands on this peer. ' +
  'Use mesh_discover first to find available peers and their join addresses.';

export const PROMPT =
  'Connects to a remote peer by making an HTTP request to their peer-info endpoint. ' +
  'The peer must be sharing (via mesh_share) and reachable on the network. ' +
  'After joining, the mesh node appears in the mesh list with their name, role, and other info. ' +
  'Use mesh_discover to find peers to join.';
