/** MeshSendMessageTool — send a chat message to a mesh node */

export const MESH_SEND_MESSAGE_TOOL_NAME = 'mesh_send_message';

export const DESCRIPTION =
  'Send a chat message to a mesh node Clew Code instance on the LAN. ' +
  'The peer receives the message immediately and it auto-injects into their AI prompt. ' +
  'Supports waiting for response: set `waitResponse: true` to receive a reply in one call. ' +
  'Use mesh_discover first to find available peers and their hostnames/ports.\n\n' +
  '**Important for spawned peers**: When sending a task to a mesh node spawned via `mesh_spawn`, ' +
  'always include your own name and port in the message so the mesh node knows where to reply. ' +
  'Example: "I am {your_mesh_name} (port {your_port}). Task: ... Reply back to me."';

export const PROMPT =
  'This tool sends a chat message to a mesh node Clew Code instance on the LAN. ' +
  'The peer sees the message immediately in their CLI and it is auto-injected into their AI prompt. ' +
  'Use mesh_discover first to find available peers. ' +
  'The `peer` parameter accepts a hostname (e.g. "dev-laptop"), peer ID, or port number. ' +
  'The `message` parameter is the text to send.\n\n' +
  'For request-response patterns, set `waitResponse: true` with a `responseTimeout` (default 60s). ' +
  'Instead of send-then-poll, the tool blocks until the mesh node replies or timeout expires.\n\n' +
  'For long messages (research reports, code, etc.), set `chunk: true` to auto-split into chunks. ' +
  'The receiver will see the chunks automatically reassembled into one message when using mesh_list_messages. ' +
  'Chunks are sent sequentially, so this works best without waitResponse.\n\n' +
  '**Sender identity in task messages**: When sending a task to a spawned peer, always include ' +
  'your own mesh name and port number in the message text. ' +
  'Example: "I am {your_name} (port {your_port}). Do X and send the result back to me." ' +
  'This lets the mesh node know where to reply.';
