/** MeshRunTool — run a shell command on a mesh node */

export const MESH_RUN_TOOL_NAME = 'mesh_run';

export const DESCRIPTION =
  'Run a shell command on a remote mesh node and get the output back. ' +
  'The worker must be sharing (via mesh_share start) and reachable on the LAN. ' +
  'Use mesh_discover first to find workers. ' +
  'The command is executed on the worker machine and stdout/stderr are returned.';

export const PROMPT =
  'Executes a shell command on a remote mesh node via its HTTP API. ' +
  "The worker's MeshServer runs the command with the default shell (bash on Linux/macOS, " +
  'cmd/powershell on Windows) and returns stdout, stderr, and exit code. ' +
  'Only works for workers that are currently sharing on the same LAN. ' +
  'Use mesh_discover to find available workers first.';
