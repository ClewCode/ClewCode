export const SWARM_SET_ROLE_TOOL_NAME = 'swarm_set_role';

export const DESCRIPTION =
  'Assign a role to a peer worker (e.g., "builder", "tester", "deployer"). ' +
  'Roles help organize workers by function. Use swarm_discover first to find workers.';

export const PROMPT =
  'Assigns a functional role to a peer worker. The role is displayed in the peer list and ' +
  'helps identify what each worker does. Examples: "builder", "tester", "deployer", "monitor". ' +
  'Use swarm_list_roles to see all workers and their assigned roles.';
