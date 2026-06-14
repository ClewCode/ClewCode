/** MeshListMessagesTool — list received chat messages from peers */

export const MESH_LIST_MESSAGES_TOOL_NAME = 'mesh_list_messages';

export const DESCRIPTION =
  'List chat messages received from peers. ' +
  'Shows sender name, message text, and timestamp. ' +
  'Use this to review message history or check for specific past messages. ' +
  'Note: NEW messages arrive automatically as <system-reminder> in the conversation — ' +
  'you do NOT need to poll or wait for messages. Only use this tool to look up historical messages.';

export const PROMPT =
  'This tool lists peer chat messages in the local store. ' +
  'It returns messages with sender names, text content, and timestamps. ' +
  'Chunked messages (sent with `chunk: true`) are automatically reassembled into one message.\n\n' +
  'IMPORTANT: New peer messages arrive automatically as system-reminder messages in the ' +
  'conversation. You do NOT need to use this tool to check for new messages — ' +
  'they appear in the conversation on their own. ' +
  'Only use this tool to look up message history or verify past exchanges.';
