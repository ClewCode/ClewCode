/** MeshInfoTool — get detailed info about a specific peer */

export const MESH_INFO_TOOL_NAME = 'mesh_info';

export const DESCRIPTION =
  'Get detailed information about a specific peer/worker by hostname or ID. ' +
  'Returns their IP, port, working directory, shell, platform, and current status. ' +
  'Supports waiting: set `wait: true` to retry until the worker appears. ' +
  'Use mesh_discover first to find workers and their IDs.';

export const PROMPT =
  'Fetches detailed information about a mesh node from the local peer store, ' +
  'or directly from the mesh node via HTTP if not cached. Returns hostname, IP, port, ' +
  'current working directory, shell type, platform, and online status.\n\n' +
  'Use `wait: true` with `timeout` to wait for a worker to appear, instead of polling.';
