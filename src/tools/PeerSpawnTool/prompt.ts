export const PEER_SPAWN_TOOL_NAME = 'peer_spawn';

export const DESCRIPTION =
  'Spawn a new peer terminal window on the local machine with optional custom settings ' +
  '(name, role, model, system prompt). Use peer_discover after spawning to find the peer. ' +
  'Use this to dynamically spin up new peer nodes for task delegation.\n\n' +
  '**IMPORTANT**: After spawning, when you send a task via `peer_send_message`, ' +
  'include your own name and port in the message so the peer node knows where to reply. ' +
  'Example: "I am {your_name} on port {your_port}. Do X and reply back to me."\n\n' +
  "See the spawned peer node's default prompt in `DEFAULT_PEER_PROMPT` for the reply protocol.";

export const PROMPT =
  'Spawns a new local peer terminal window running Clew Code. The spawned peer will share automatically. ' +
  'Use peer_discover after spawning to find and join the peer.\n\n' +
  '**Sender identity**: After spawning, use `peer_send_message` to assign tasks. ' +
  'Always include your name + port in the message so the peer node can reply. ' +
  'Example: "I am {your_peer_name} (port {your_port}). Task: ... Send the result back to me."\n\n' +
  "**Reply flow**: The spawned peer node's default prompt instructs it to:\n" +
  '1. `peer_share status` to confirm sharing and learn its own port\n' +
  '2. When it receives a task message with sender info, do the task\n' +
  '3. Reply via `peer_send_message({ peer: "<sender_peer_name>", message: "result" })`';
