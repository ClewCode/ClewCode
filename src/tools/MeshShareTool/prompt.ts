/** MeshShareTool — start/stop sharing as a worker */

export const MESH_SHARE_TOOL_NAME = 'mesh_share';

export const DESCRIPTION =
  'Start or stop advertising this Clew Code instance as a worker. ' +
  'When sharing, other instances and the AI can discover this machine via mesh_discover ' +
  'and assign tasks via mesh_send_task. ' +
  'Use with action="start" to begin sharing, or action="stop" to stop.';

export const PROMPT =
  'Controls whether this Clew Code instance advertises itself as a worker on the LAN. ' +
  'When sharing is enabled, other instances can discover this machine, see its working ' +
  'directory and shell type, and assign tasks to it via mesh_send_task. ' +
  'The status command shows whether sharing is currently active.';
