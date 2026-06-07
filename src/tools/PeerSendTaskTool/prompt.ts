/** PeerSendTaskTool — send a task to a worker peer */

export const PEER_SEND_TASK_TOOL_NAME = 'peer_send_task';

export const DESCRIPTION =
  'Assign a task to a worker Clew Code instance on the LAN. ' +
  'The worker receives the task and can view it via `/peer todos`. ' +
  'Use peer_discover first to find available workers and their IDs/hostnames.';

export const PROMPT =
  'This tool sends a task description to a worker Clew Code instance on the LAN. ' +
  'The worker can see the task with `/peer todos` and mark it done with `/peer todo done <id>`. ' +
  'Use peer_discover first to find available workers. ' +
  'The `worker` parameter accepts a hostname (e.g. "dev-laptop") or partial peer ID. ' +
  'The `task` parameter should be a clear description of what needs to be done.';
