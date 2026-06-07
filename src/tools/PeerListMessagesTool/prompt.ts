/** PeerListMessagesTool — list received chat messages from peers */

export const PEER_LIST_MESSAGES_TOOL_NAME = 'peer_list_messages';

export const DESCRIPTION =
  'List all chat messages received from peers. ' +
  'Shows sender name, message text, and timestamp. ' +
  'Messages include both those received and those sent locally.';

export const PROMPT =
  'This tool lists all peer chat messages in the local store. ' +
  'It returns messages with sender names, text content, and timestamps. ' +
  'Use this to check for incoming messages from other peers.';
