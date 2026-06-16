/** PeerBroadcastTool — send a task to all connected peers */

export const PEER_BROADCAST_TOOL_NAME = 'peer_broadcast';

export const DESCRIPTION =
  'Broadcast a task to ALL currently connected peers at once. ' +
  'Each peer receives the task individually. ' +
  'Use peer_list_roles first to see who will receive the broadcast.';

export const PROMPT =
  'This tool sends the same task to every connected peer simultaneously. ' +
  'It returns a summary of which peers received the task and which failed. ' +
  'The `task` parameter should be a clear description of what needs to be done. ' +
  'Use peer_list_roles first to confirm which peers will receive the broadcast.';
