export const PEER_LIST_ROLES_TOOL_NAME = 'peer_list_roles';

export const DESCRIPTION =
  'List all discovered peer workers with their display names and roles. ' +
  'Shows hostname, custom name (if set via peer_set_name), and role (if set via peer_set_role).';

export const PROMPT =
  'Lists all discovered peer workers and their assigned metadata (display name, role). ' +
  'Use peer_set_name to assign custom names and peer_set_role to assign roles to workers. ' +
  'This helps keep track of which worker does what.';
