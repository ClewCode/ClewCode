/** PeerMemorySyncTool — pull memories from a peer node into the local memory DB */

export const PEER_MEMORY_SYNC_TOOL_NAME = 'peer_memory_sync';

export const DESCRIPTION =
  "Pull top-ranked memories from a peer node's SQLite memory store and merge them into the local one. " +
  'Duplicates reinforce existing memories instead of creating copies; imported memories get a confidence discount. ' +
  'Use this to share learned project knowledge (decisions, gotchas, workflows) across machines on the LAN.';

export const PROMPT =
  "This tool fetches a peer node's exported memories (GET /peer-memory-export) and imports them into the local memory database. " +
  'The `peer` parameter accepts a hostname, peer ID, display name, or port number. ' +
  '`limit` caps how many memories to fetch (default 50, max 200).\n\n' +
  'Imported memories are stored under the local project path with a confidence discount, so peer knowledge is a hint rather than a verified fact. ' +
  'Identical content is deduplicated — re-syncing is safe and idempotent.';
