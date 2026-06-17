/** PeerDashboardTool — show peer task dashboard */

export const PEER_DASHBOARD_TOOL_NAME = 'peer_dashboard';

export const DESCRIPTION =
  'Show the current peer task dashboard: connected peers, their assigned tasks, ' +
  'and any results that have come back. Use this to see which peers have pending ' +
  'work, which tasks are done, and review result summaries. Results are shown ' +
  'in a collapsed format; use peer_list_messages or /peer inbox for full detail.';

export const PROMPT =
  'This tool returns a formatted text dashboard of all connected peers and their ' +
  'tasks. Use it to monitor progress across peers, check which tasks are done, ' +
  'and review result summaries. Each peer is listed with its tasks and status. ' +
  'Results from completed tasks are shown as a one-line preview.';
