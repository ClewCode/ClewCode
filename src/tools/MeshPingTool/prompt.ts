/** MeshPingTool — check if a mesh node is online */

export const MESH_PING_TOOL_NAME = 'mesh_ping';

export const DESCRIPTION =
  'Check if a specific peer is still online and reachable. ' +
  "Sends a GET request to the mesh node's /mesh-info endpoint. " +
  'Supports waiting: set `wait: true` to retry until the mesh node comes online. ' +
  'Use this to verify connectivity before sending tasks or messages.';

export const PROMPT =
  'This tool pings a mesh node to check if they are online. ' +
  "It makes a GET request to /mesh-info and returns the mesh node's status. " +
  'The `peer` parameter accepts a hostname, peer ID, or port number. ' +
  'Use `wait: true` with a `timeout` to wait for a mesh node to come online, instead of polling in a loop.\n\n' +
  'Use this to verify that a mesh node is reachable before sending tasks or messages.';
