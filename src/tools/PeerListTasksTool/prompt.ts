/** PeerListTasksTool — list received tasks from peer workers */

export const PEER_LIST_TASKS_TOOL_NAME = 'peer_list_tasks';

export const DESCRIPTION =
  'List all tasks received from peer workers or sent to workers. ' +
  'Shows pending, done, and rejected tasks with their IDs and descriptions.';

export const PROMPT =
  'This tool lists all tasks in the local task registry. Tasks are created when ' +
  'peer_send_task is used to assign work to a remote worker, or when a remote ' +
  'peer sends a task to this instance. Each task has a status: pending, done, or rejected. ' +
  'Use this to check the status of previously assigned work.';
