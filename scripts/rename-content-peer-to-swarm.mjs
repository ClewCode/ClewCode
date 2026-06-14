/**
 * Content rename: peer -> swarm in all Swarm* tool files
 */
import fs from 'node:fs';
import path from 'node:path';

function walk(dir) {
  const r = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) r.push(...walk(f));
    else if (e.name.endsWith('.ts') || e.name.endsWith('.tsx')) r.push(f);
  }
  return r;
}

const dirs = [
  'src/tools/SwarmBroadcastTool',
  'src/tools/SwarmDisconnectTool',
  'src/tools/SwarmDiscoverTool',
  'src/tools/SwarmJoinTool',
  'src/tools/SwarmListMessagesTool',
  'src/tools/SwarmListRolesTool',
  'src/tools/SwarmPingTool',
  'src/tools/SwarmRunTool',
  'src/tools/SwarmSendMessageTool',
  'src/tools/SwarmSetNameTool',
  'src/tools/SwarmSetRoleTool',
  'src/tools/SwarmShareTool',
  'src/tools/SwarmSpawnTool',
  'src/tools/ProcessSwarmTool',
  'src/tools/CodexSwarmTool',
  'src/swarm',
];

const files = [];
for (const d of dirs) {
  if (fs.existsSync(d)) files.push(...walk(d));
}

for (const f of files) {
  let c = fs.readFileSync(f, 'utf-8');
  const orig = c;

  // PeerXxx -> SwarmXxx (class/identifier names)
  c = c.replace(/\bPeer(Broadcast|Disconnect|Discover|Join|ListMessages|ListRoles|Ping|Run|SendMessage|SetName|SetRole|Share|Spawn|Info|Help|Server|Store|Discovery|StatusLine)\b/g, 'Swarm$1');
  c = c.replace(/\bProcessPeer(Provider|Tool)\b/g, 'ProcessSwarm$1');
  c = c.replace(/\bCodexPeerTool\b/g, 'CodexSwarmTool');

  // peer_xxx -> swarm_xxx (tool name constants)
  c = c.replace(/peer_/g, 'swarm_');

  // peerXxx -> swarmXxx (camelCase variables)
  c = c.replace(/\bpeer(Server|Store|Discovery|Port|Name|Info|List|Count|Connection|Sharing|Health)\b/g, 'swarm$1');

  // usePeerAutoInject -> useSwarmAutoInject
  c = c.replace(/\busePeerAutoInject\b/g, 'useSwarmAutoInject');

  // /peer -> /swarm (command paths)
  c = c.replace(/\/peer\b/g, '/swarm');

  if (c !== orig) {
    fs.writeFileSync(f, c, 'utf-8');
    console.log('OK:', f);
  }
}
console.log('DONE');
