export const PEER_SPAWN_TOOL_NAME = 'peer_spawn';

export const DESCRIPTION =
  'Spawn a new peer terminal window on the local machine with optional custom settings ' +
  '(name, role, model, system prompt) and optionally auto-joins it to establish connection. ' +
  'Use this to dynamically spin up new peer workers for task delegation.';

export const PROMPT =
  'Spawns a new local peer terminal window running Clew Code. The spawned peer will share automatically. ' +
  'By default, if autoJoin is true, it polls for the peer to start, and joins/registers it as a connection ' +
  'so you can send messages or run commands on it.';
