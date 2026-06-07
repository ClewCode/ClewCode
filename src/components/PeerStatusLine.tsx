import type * as React from 'react';
import { Box, Text } from '../ink.js';
import { getGlobalPeerStore } from '../peer/PeerStore.js';
import { getGlobalDiscovery } from '../peer/PeerDiscovery.js';
import { useEffect, useState } from 'react';

export function PeerStatusLine(): React.ReactNode {
  const [peers, setPeers] = useState(0);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    const store = getGlobalPeerStore();
    const discovery = getGlobalDiscovery();

    const update = () => {
      setPeers(store.getPeers().length);
      setSharing(discovery.isSharing);
    };
    update();
    const iv = setInterval(update, 5000);
    return () => clearInterval(iv);
  }, []);

  if (peers === 0 && !sharing) return null;

  return (
    <Box paddingLeft={1}>
      <Text dimColor>
        {sharing ? '⬡ sharing' : ''}
        {sharing && peers > 0 ? ' | ' : ''}
        {peers > 0 ? `⬡ ${peers} peer(s)` : ''}
      </Text>
    </Box>
  );
}
