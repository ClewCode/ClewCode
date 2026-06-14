/** SwarmPingTool — check if a peer is online */

export const SWARM_PING_TOOL_NAME = 'swarm_ping';

export const DESCRIPTION =
  'Check if a specific peer is still online and reachable. ' +
  "Sends a GET request to the peer's /swarm-info endpoint. " +
  'Supports waiting: set `wait: true` to retry until the peer comes online. ' +
  'Use this to verify connectivity before sending tasks or messages.';

export const PROMPT =
  'This tool pings a peer to check if they are online. ' +
  "It makes a GET request to /swarm-info and returns the peer's status. " +
  'The `peer` parameter accepts a hostname, peer ID, or port number. ' +
  'Use `wait: true` with a `timeout` to wait for a peer to come online, instead of polling in a loop.\n\n' +
  'Use this to verify that a peer is reachable before sending tasks or messages.';
