const fs = require('fs');
const path = require('path');

function walk(dir) {
  const r = [];
  for (const e of fs.readdirSync(dir, {withFileTypes:true})) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'dist') r.push(...walk(f));
    } else if (e.name.endsWith('.ts') || e.name.endsWith('.tsx')) r.push(f);
  }
  return r;
}

const files = walk('src');
let count = 0;
for (const f of files) {
  let c = fs.readFileSync(f, 'utf-8');
  const orig = c;

  c = c.replace(/\/peer\//g, '/swarm/');
  c = c.replace(/\bPeer(Broadcast|Disconnect|Discover|Join|ListMessages|ListRoles|Ping|Run|SendMessage|SetName|SetRole|Share|Spawn|Info|Help|Server|Store|Discovery|StatusLine|Type)Tool\b/g, 'Swarm$1Tool');
  c = c.replace(/\bPeer(Broadcast|Disconnect|Discover|Join|ListMessages|ListRoles|Ping|Run|SendMessage|SetName|SetRole|Share|Spawn|Info|Help|Server|Store|Discovery|StatusLine|Type)\b/g, 'Swarm$1');
  c = c.replace(/\bProcessPeer(Provider|Tool)/g, 'ProcessSwarm$1');
  c = c.replace(/\bCodexPeer/g, 'CodexSwarm');
  c = c.replace(/\bgetProcessPeerProvider\b/g, 'getProcessSwarmProvider');
  c = c.replace(/\bgetProcessPeerProviderIds\b/g, 'getProcessSwarmProviderIds');
  c = c.replace(/\bmyPeerId\b/g, 'mySwarmId');
  c = c.replace(/\bpeerId\b/g, 'swarmId');
  c = c.replace(/\bPEER_(\w+)_TOOL_NAME\b/g, 'SWARM_$1_TOOL_NAME');
  c = c.replace(/\bpeer(Server|Store|Discovery|Port|Name|Info|List|Count|Connection|Sharing|Health)\b/g, 'swarm$1');
  c = c.replace(/\bgetGlobalPeer(Server|Store)\b/g, 'getGlobalSwarm$1');
  c = c.replace(/\bnotifyPeerFeedback\b/g, 'notifySwarmFeedback');
  c = c.replace(/\bsetPeerFeedbackHandler\b/g, 'setSwarmFeedbackHandler');
  c = c.replace(/\bPeerFeedback\b/g, 'SwarmFeedback');
  c = c.replace(/\bpeer-feedback/g, 'swarm-feedback');
  c = c.replace(/\bpeerFeedback/g, 'swarmFeedback');
  c = c.replace(/\/peer\b/g, '/swarm');
  c = c.replace(/['"]peer-/g, (m) => m.replace('peer-', 'swarm-'));
  c = c.replace(/\bspawnPeerTerminal\b/g, 'spawnSwarmTerminal');
  c = c.replace(/\bparseProcessPeerRunArgs\b/g, 'parseProcessSwarmRunArgs');
  c = c.replace(/\bProcessPeerRunArgs\b/g, 'ProcessSwarmRunArgs');

  if (c !== orig) { fs.writeFileSync(f, c, 'utf-8'); count++; }
}
console.log('Updated:', count, 'files');
