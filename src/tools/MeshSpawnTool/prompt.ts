export const MESH_SPAWN_TOOL_NAME = 'mesh_spawn';

export const DESCRIPTION =
  'Spawn a new peer terminal window on the local machine with optional custom settings ' +
  '(name, role, model, system prompt) and optionally auto-joins it to establish connection. ' +
  'Use this to dynamically spin up new mesh nodes for task delegation.\n\n' +
  '**IMPORTANT**: After spawning, when you send a task via `mesh_send_message`, ' +
  'include your own name and port in the message so the mesh node knows where to reply. ' +
  'Example: "I am {your_name} on port {your_port}. Do X and reply back to me."\n\n' +
  "See the spawned mesh node's default prompt in `DEFAULT_MESH_PROMPT` for the reply protocol.";

export const PROMPT =
  'Spawns a new local peer terminal window running Clew Code. The spawned peer will share automatically. ' +
  'By default, if autoJoin is true, it polls for the mesh node to start, and joins/registers it as a connection ' +
  'so you can send messages or run commands on it.\n\n' +
  '**Sender identity**: After spawning, use `mesh_send_message` to assign tasks. ' +
  'Always include your name + port in the message so the mesh node can reply. ' +
  'Example: "I am {your_mesh_name} (port {your_port}). Task: ... Send the result back to me."\n\n' +
  "**Reply flow**: The spawned mesh node's default prompt instructs it to:\n" +
  '1. `mesh_share status` to confirm sharing and learn its own port\n' +
  '2. When it receives a task message with sender info, do the task\n' +
  '3. Reply via `mesh_send_message({ peer: "<sender_mesh_name>", message: "result" })`';
