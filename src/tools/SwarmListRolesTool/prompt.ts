export const SWARM_LIST_ROLES_TOOL_NAME = 'swarm_list_roles';

export const DESCRIPTION =
  'List all discovered peer workers with their display names and roles. ' +
  'Shows hostname, custom name (if set via swarm_set_name), and role (if set via swarm_set_role). ' +
  'Supports waiting: set `wait: true` to wait for peers to appear. ' +
  'Use `minPeers` to wait for a minimum number of peers.';

export const PROMPT =
  'Lists all discovered peer workers and their assigned metadata (display name, role). ' +
  'Use swarm_set_name to assign custom names and swarm_set_role to assign roles to workers. ' +
  'Use `wait: true` with `timeout` and `minPeers` to wait for peers to appear on the network, ' +
  'instead of polling in a loop.\n\n' +
  'This helps keep track of which worker does what.';
