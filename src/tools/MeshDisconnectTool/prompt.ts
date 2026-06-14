/** MeshDisconnectTool — remove a mesh node from the connection list */

export const MESH_DISCONNECT_TOOL_NAME = 'mesh_disconnect';

export const DESCRIPTION =
  'Disconnect and remove a mesh node from the connection list. ' +
  'The peer will no longer appear in the mesh list and cannot receive tasks.';

export const PROMPT =
  'This tool removes a mesh node from the local connection list. ' +
  'Use this to clean up stale or unwanted connections. ' +
  'The `peer` parameter accepts a hostname, peer ID, or port number.';
