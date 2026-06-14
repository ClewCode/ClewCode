import type * as React from 'react';
import { useEffect, useState } from 'react';
import { Box, Text } from '../ink.js';
import { getGlobalDiscovery } from '../swarm/SwarmDiscovery.js';
import { getGlobalSwarmServer } from '../swarm/SwarmServer.js';
import { getGlobalSwarmStore } from '../swarm/SwarmStore.js';
import { summarizePeerMesh } from '../swarm/swarmHealth.js';
import type { SwarmInfo } from '../swarm/types.js';

export function SwarmStatusLine(): React.ReactNode {
  const [peers, setPeers] = useState<SwarmInfo[]>([]);
  const [sharing, setSharing] = useState(false);
  const [myName, setMyName] = useState('');
  const [myRole, setMyRole] = useState<string | undefined>(undefined);

  useEffect(() => {
    const store = getGlobalSwarmStore();
    const discovery = getGlobalDiscovery();
    const server = getGlobalSwarmServer();

    const update = () => {
      setPeers(store.getPeers());
      setSharing(discovery.isSharing);
      setMyName(server.extraInfo.displayName || discovery.hostname);
      setMyRole(server.extraInfo.role);
    };
    update();
    const iv = setInterval(update, 5000);
    return () => clearInterval(iv);
  }, []);

  if (peers.length === 0 && !sharing) return null;

  const mesh = summarizePeerMesh(peers);
  const meshText =
    peers.length > 0
      ? ` | mesh ${mesh.healthy}/${peers.length} ok${mesh.lagging > 0 ? ` ${mesh.lagging} slow` : ''}${mesh.offline > 0 ? ` ${mesh.offline} off` : ''}${mesh.avgLatencyMs !== undefined ? ` avg ${Math.round(mesh.avgLatencyMs)}ms` : ''}`
      : '';

  return (
    <Box paddingLeft={1}>
      <Text dimColor>
        {sharing
          ? `⬡ sharing: ${myName}${myRole ? ` (${myRole})` : ''}`
          : `⬡ me: ${myName}${myRole ? ` (${myRole})` : ''}`}
        {meshText}
      </Text>
    </Box>
  );
}
