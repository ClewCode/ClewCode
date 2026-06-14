export const MESH_SET_ROLE_TOOL_NAME = 'mesh_set_role';

export const DESCRIPTION =
  'Assign a role to a mesh node (e.g., "builder", "tester", "deployer"). ' +
  'Roles help organize workers by function. Use mesh_discover first to find workers.';

export const PROMPT =
  'Assigns a functional role to a mesh node. The role is displayed in the mesh list and ' +
  'helps identify what each worker does. Examples: "builder", "tester", "deployer", "monitor". ' +
  'Use mesh_list_roles to see all workers and their assigned roles.';
