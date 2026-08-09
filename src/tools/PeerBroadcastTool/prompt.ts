/** PeerBroadcastTool — send a task to all connected peers */

export const PEER_BROADCAST_TOOL_NAME = 'peer_broadcast';

export const DESCRIPTION =
  'Broadcast an AI prompt task to ALL currently connected peers at once. ' +
  'Each peer receives the task individually and works it with its own model. ' +
  'This sends prompts, not shell commands — to run a shell command on peers use peer_exec instead. ' +
  'Call peer_manage({ action: "list" }) first to see who will receive the broadcast.';

export const PROMPT =
  'This tool sends the same task to every connected peer simultaneously. ' +
  'It returns a summary of which peers received the task and which failed. ' +
  'The `task` parameter should be a clear description of what needs to be done. ' +
  'Call peer_manage({ action: "list" }) first to confirm which peers will receive the broadcast.';
