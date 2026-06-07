/** PeerSendMessageTool — send a chat message to a peer */

export const PEER_SEND_MESSAGE_TOOL_NAME = 'peer_send_message';

export const DESCRIPTION =
  'Send a chat message to a peer Clew Code instance on the LAN. ' +
  'The peer receives the message immediately and it auto-injects into their AI prompt. ' +
  'Use peer_discover first to find available peers and their hostnames/ports.';

export const PROMPT =
  'This tool sends a chat message to a peer Clew Code instance on the LAN. ' +
  'The peer sees the message immediately in their CLI and it is auto-injected into their AI prompt. ' +
  'Use peer_discover first to find available peers. ' +
  'The `peer` parameter accepts a hostname (e.g. "dev-laptop"), peer ID, or port number. ' +
  'The `message` parameter is the text to send.';
