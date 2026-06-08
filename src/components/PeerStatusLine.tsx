import type * as React from 'react';
import { useEffect, useState } from 'react';
import { Box, Text } from '../ink.js';
import { getGlobalDiscovery } from '../peer/PeerDiscovery.js';
import { getGlobalPeerServer } from '../peer/PeerServer.js';
import { getGlobalPeerStore } from '../peer/PeerStore.js';

export function PeerStatusLine(): React.ReactNode {
  const [peers, setPeers] = useState(0);
  const [sharing, setSharing] = useState(false);
  const [myName, setMyName] = useState('');
  const [myRole, setMyRole] = useState<string | undefined>(undefined);

  useEffect(() => {
    const store = getGlobalPeerStore();
    const discovery = getGlobalDiscovery();
    const server = getGlobalPeerServer();

    const update = () => {
      setPeers(store.getPeers().length);
      setSharing(discovery.isSharing);
      setMyName(server.extraInfo.displayName || discovery.hostname);
      setMyRole(server.extraInfo.role);
    };
    update();
    const iv = setInterval(update, 5000);
    return () => clearInterval(iv);
  }, []);

  if (peers === 0 && !sharing) return null;

  return (
    <Box paddingLeft={1}>
      <Text dimColor>
        {sharing
          ? `⬡ sharing: ${myName}${myRole ? ` (${myRole})` : ''}`
          : `⬡ me: ${myName}${myRole ? ` (${myRole})` : ''}`}
        {peers > 0 ? ` | ⬡ ${peers} peer(s)` : ''}
      </Text>
    </Box>
  );
}
