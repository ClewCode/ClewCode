export const PEER_SET_ROLE_TOOL_NAME = 'peer_set_role';

export const DESCRIPTION =
  'Assign a role to a peer node (e.g., "builder", "tester", "deployer"). ' +
  'Roles help organize peers by function. Use peer_discover first to find peers.';

export const PROMPT =
  'Assigns a functional role to a peer node. The role is displayed in the peer list and ' +
  'helps identify what each peer does. Examples: "builder", "tester", "deployer", "monitor". ' +
  'Use peer_list_roles to see all peers and their assigned roles.';
