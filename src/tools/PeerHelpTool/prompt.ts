/** PeerHelpTool — comprehensive guide to agent-to-agent tools and their correct usage */

export const PEER_HELP_TOOL_NAME = 'peer_help';

export const DESCRIPTION =
  'Complete guide to agent-to-agent tools. ' +
  'Shows the correct flow, which tool to use when, common mistakes, and best practices. ' +
  'Use this when unsure how to use peer tools or when a peer node workflow fails.';

// NOTE: the actual per-topic help content lives in the `TOPICS` record in
// PeerHelpTool.ts (served via the tool's call()). Only PEER_HELP_TOOL_NAME and
// DESCRIPTION are consumed from this file. Don't add topic bodies here — keep a
// single source of truth so the guide can't drift.
