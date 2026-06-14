export const MESH_LIST_ROLES_TOOL_NAME = 'mesh_list_roles';

export const DESCRIPTION =
  'List all discovered mesh nodes with their display names and roles. ' +
  'Shows hostname, custom name (if set via mesh_set_name), and role (if set via mesh_set_role). ' +
  'Supports waiting: set `wait: true` to wait for peers to appear. ' +
  'Use `minMeshs` to wait for a minimum number of peers.';

export const PROMPT =
  'Lists all discovered mesh nodes and their assigned metadata (display name, role). ' +
  'Use mesh_set_name to assign custom names and mesh_set_role to assign roles to workers. ' +
  'Use `wait: true` with `timeout` and `minMeshs` to wait for peers to appear on the network, ' +
  'instead of polling in a loop.\n\n' +
  'This helps keep track of which worker does what.';
