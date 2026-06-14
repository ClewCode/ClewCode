export const MESH_SET_NAME_TOOL_NAME = 'mesh_set_name';

export const DESCRIPTION =
  'Set a custom display name for a mesh node. This name is shown in the mesh list ' +
  'instead of the hostname. Use mesh_discover first to find workers.';

export const PROMPT =
  'Assigns a human-readable display name to a mesh node. The name is stored locally and ' +
  'replaces the hostname in the mesh list display. Useful for identifying workers by function ' +
  '(e.g., "dev-box", "build-server") instead of hostname.';
